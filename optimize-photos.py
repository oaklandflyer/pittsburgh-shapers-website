#!/usr/bin/env python3
"""
optimize-photos.py — Global Shapers Pittsburgh website photo tool
=================================================================

WHAT IT DOES
  1. Reads every image you drop into the  photos-incoming/  folder
     (JPG, PNG, HEIC/iPhone, WEBP, TIFF, BMP).
  2. Shrinks each one to web size (longest edge 1600px by default),
     fixes sideways-phone rotation, strips hidden location/EXIF data,
     and saves a compressed  .jpg  +  .webp  into  assets/photos/.
  3. Rewrites the "THE HUB IN ACTION" gallery in  index.html  so the
     photos actually appear on the site — no HTML editing needed.

HOW TO USE (do this every time you add photos)
  1. Put your photos in the  photos-incoming/  folder.
  2. Open a terminal in this project folder and run:
         python3 optimize-photos.py
  3. Open  index.html  in a browser to see them. Commit / upload the
     changed  index.html  and the new files in  assets/photos/.

TIPS
  • Ordering: name files  01_river.jpg, 02_team.jpg …  — they show in
    filename order. The number prefix is dropped from the caption.
  • Captions: the caption is taken from the file name, so
    "shred-the-debt-launch.jpg"  ->  "Shred The Debt Launch".
  • Re-running is safe. Already-optimized photos are skipped unless the
    original changed. Use  --force  to redo everything.
  • Delete a photo from the site by removing it from BOTH
    photos-incoming/  and  assets/photos/, then run the tool again.

REQUIREMENTS  (one-time setup)
      pip install pillow
  For iPhone .HEIC photos also run:
      pip install pillow-heif
"""

import sys
import os
import re
import argparse
from pathlib import Path

# ----------------------------- settings -----------------------------------
MAX_EDGE      = 1600     # longest side, in pixels, after resizing
JPG_QUALITY   = 82       # 0-100 (higher = better quality, bigger file)
WEBP_QUALITY  = 80
INPUT_EXTS    = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff",
                 ".bmp", ".heic", ".heif"}
MARK_START    = "<!-- PHOTOS:START -->"
MARK_END      = "<!-- PHOTOS:END -->"
# --------------------------------------------------------------------------

ROOT     = Path(__file__).resolve().parent
INCOMING = ROOT / "photos-incoming"
OUTDIR   = ROOT / "assets" / "photos"
INDEX    = ROOT / "index.html"


def die(msg: str) -> None:
    print("\n  ✗ " + msg + "\n")
    sys.exit(1)


def human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n/1024:.1f} KB"
    return f"{n/1024/1024:.2f} MB"


def load_pillow():
    try:
        from PIL import Image, ImageOps  # noqa
    except ImportError:
        die("Pillow isn't installed. Run:  pip install pillow"
            "\n    (for iPhone HEIC photos also:  pip install pillow-heif)")
    from PIL import Image, ImageOps
    # optional HEIC/HEIF support
    heic_ok = False
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        heic_ok = True
    except Exception:
        heic_ok = False
    return Image, ImageOps, heic_ok


def slugify(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
    return name or "photo"


def caption_from(stem: str) -> str:
    # drop a leading order prefix like  01_  1-  02(space)
    cleaned = re.sub(r"^\s*\d+\s*[-_. ]\s*", "", stem)
    cleaned = re.sub(r"[-_]+", " ", cleaned).strip()
    return cleaned.title() if cleaned else "Global Shapers Pittsburgh"


def build_gallery_html(photos):
    """photos: list of (jpg_filename, webp_filename, caption)"""
    if not photos:
        return (
            '\n        <div class="gallery-empty">\n'
            '          No photos yet — drop images into <b>photos-incoming/</b> and run '
            '<b>optimize-photos.py</b> to publish them here.\n'
            '        </div>\n        '
        )
    rows = ["\n"]
    for jpg, webp, cap in photos:
        safe_cap = cap.replace('"', "&quot;")
        rows.append(
            '        <figure>\n'
            f'          <picture>\n'
            f'            <source type="image/webp" srcset="assets/photos/{webp}">\n'
            f'            <img src="assets/photos/{jpg}" alt="{safe_cap}" loading="lazy" decoding="async">\n'
            f'          </picture>\n'
            f'          <figcaption>{safe_cap}</figcaption>\n'
            '        </figure>\n'
        )
    rows.append("        ")
    return "".join(rows)


def inject_gallery(photos):
    if not INDEX.exists():
        print(f"  ! {INDEX.name} not found — skipping site update "
              "(images were still optimized into assets/photos/).")
        return False
    html = INDEX.read_text(encoding="utf-8")
    if MARK_START not in html or MARK_END not in html:
        print("  ! Gallery markers not found in index.html — skipping site update.")
        print(f"    Add {MARK_START} and {MARK_END} inside the gallery grid to enable auto-publishing.")
        return False
    block = build_gallery_html(photos)
    new = re.sub(
        re.escape(MARK_START) + r".*?" + re.escape(MARK_END),
        MARK_START + block + MARK_END,
        html,
        flags=re.DOTALL,
    )
    if new != html:
        INDEX.write_text(new, encoding="utf-8")
    return True


def main():
    ap = argparse.ArgumentParser(
        description="Optimize photos and publish them to the site gallery.")
    ap.add_argument("--force", action="store_true",
                    help="Re-optimize every photo even if unchanged.")
    ap.add_argument("--max-edge", type=int, default=MAX_EDGE,
                    help=f"Longest side in pixels (default {MAX_EDGE}).")
    args = ap.parse_args()

    Image, ImageOps, heic_ok = load_pillow()

    INCOMING.mkdir(exist_ok=True)
    OUTDIR.mkdir(parents=True, exist_ok=True)

    sources = sorted(
        [p for p in INCOMING.iterdir()
         if p.is_file() and p.suffix.lower() in INPUT_EXTS
         and not p.name.startswith(".")],
        key=lambda p: p.name.lower(),
    )

    if not sources:
        print(f"\n  No images found in  {INCOMING.name}/")
        print("  Drop some photos in there and run this again.\n")
        # still refresh the gallery (e.g. shows empty state / prunes removed)
        publish_from_outdir(inject=True)
        return

    print(f"\n  Optimizing {len(sources)} photo(s) → assets/photos/\n")
    total_before = total_after = 0
    used_slugs = set()
    processed = []
    skipped_heic = []

    for src in sources:
        if src.suffix.lower() in {".heic", ".heif"} and not heic_ok:
            skipped_heic.append(src.name)
            continue

        slug = slugify(src.stem)
        base = slug
        i = 2
        while base in used_slugs:
            base = f"{slug}-{i}"
            i += 1
        used_slugs.add(base)

        jpg_out = OUTDIR / f"{base}.jpg"
        webp_out = OUTDIR / f"{base}.webp"
        cap = caption_from(src.stem)

        up_to_date = (jpg_out.exists() and webp_out.exists()
                      and jpg_out.stat().st_mtime >= src.stat().st_mtime
                      and webp_out.stat().st_mtime >= src.stat().st_mtime)
        if up_to_date and not args.force:
            processed.append((jpg_out.name, webp_out.name, cap))
            print(f"    · {src.name:<34} (up to date, skipped)")
            continue

        try:
            im = Image.open(src)
            im = ImageOps.exif_transpose(im)          # fix phone rotation
            if im.mode in ("RGBA", "LA", "P"):
                bg = Image.new("RGB", im.size, (255, 255, 255))
                im = im.convert("RGBA")
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")

            w, h = im.size
            scale = min(1.0, args.max_edge / max(w, h))
            if scale < 1.0:
                im = im.resize((round(w * scale), round(h * scale)),
                               Image.LANCZOS)

            im.save(jpg_out, "JPEG", quality=JPG_QUALITY,
                    optimize=True, progressive=True)
            im.save(webp_out, "WEBP", quality=WEBP_QUALITY, method=6)
        except Exception as e:
            print(f"    ✗ {src.name:<34} could not be processed ({e})")
            continue

        before = src.stat().st_size
        after = jpg_out.stat().st_size
        total_before += before
        total_after += after
        pct = (1 - after / before) * 100 if before else 0
        sign = "-" if pct >= 0 else "+"
        processed.append((jpg_out.name, webp_out.name, cap))
        print(f"    ✓ {src.name:<34} {human_size(before):>9} → "
              f"{human_size(after):>9}  ({sign}{abs(pct):.0f}%)")

    # keep gallery ordered by output filename
    processed.sort(key=lambda t: t[0].lower())
    inject_gallery(processed)

    print("\n  " + "-" * 52)
    if total_before:
        saved = total_before - total_after
        pct = saved / total_before * 100
        print(f"  Total: {human_size(total_before)} → {human_size(total_after)}"
              f"   saved {human_size(saved)} ({pct:.0f}%)")
    print(f"  Published {len(processed)} photo(s) to the gallery.")
    if skipped_heic:
        print(f"\n  ! {len(skipped_heic)} HEIC file(s) skipped — install support with:"
              "\n      pip install pillow-heif")
    print("\n  Done. Open index.html to see the gallery, then upload the")
    print("  changed index.html and assets/photos/ to your site.\n")


def publish_from_outdir(inject: bool):
    """Rebuild the gallery purely from what's already in assets/photos/."""
    if not OUTDIR.exists():
        photos = []
    else:
        jpgs = sorted([p for p in OUTDIR.glob("*.jpg")], key=lambda p: p.name.lower())
        photos = []
        for j in jpgs:
            webp = j.with_suffix(".webp")
            photos.append((j.name, webp.name if webp.exists() else j.name,
                           caption_from(j.stem)))
    if inject:
        inject_gallery(photos)
    return photos


if __name__ == "__main__":
    main()
