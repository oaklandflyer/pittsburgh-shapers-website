# Pittsburgh Shapers — Website Update Notes

Two things changed in this bundle:

1. **The official Global Shapers Pittsburgh logo is now on the site** (nav bar + footer, plus the browser tab icon).
2. **A photo tool** (`optimize-photos.py`) lets you drop photos into a folder, shrinks them for the web, and publishes them into a new **"The Hub in Action"** gallery — no HTML editing.

---

## The photo tool

### One-time setup

You need Python 3 (already on Mac; on Windows install from python.org). Then, in a terminal opened **in this project folder**, install the image library once:

```bash
pip install pillow
pip install pillow-heif      # only needed for iPhone .HEIC photos
```

### Every time you want to add photos

1. Put your photos in the **`photos-incoming/`** folder (JPG, PNG, iPhone HEIC, WEBP — all fine).
2. Run:

   ```bash
   python3 optimize-photos.py
   ```
3. Open **`index.html`** in a browser — the photos now appear in the gallery.
4. Upload the changed **`index.html`** and the new files in **`assets/photos/`** to your site.

That's it. What the tool does for each photo:

- resizes it to web size (longest edge 1600px),
- compresses it (typically **70–90% smaller** files),
- fixes sideways phone rotation,
- strips hidden location/EXIF data,
- makes both a `.jpg` and a modern `.webp`, and
- rewrites the gallery in `index.html` so it shows up on the site.

### Handy to know

| Want to… | Do this |
|---|---|
| Control the order photos appear | Name them `01_river.jpg`, `02_team.jpg`, … |
| Set the caption | It comes from the filename — `shred-the-debt-launch.jpg` → "Shred The Debt Launch" |
| Remove a photo from the site | Delete it from **both** `photos-incoming/` and `assets/photos/`, then run the tool again |
| Re-do everything from scratch | `python3 optimize-photos.py --force` |
| Change the quality/size | Edit the settings at the top of `optimize-photos.py` (`MAX_EDGE`, `JPG_QUALITY`) |

Re-running is always safe — unchanged photos are skipped.

---

## The logo

- `assets/gs-pittsburgh-mark.png` — the official circular **"C" ring mark**, used in the nav and footer next to the wordmark. On phones the nav shows just this mark to stay tidy.
- `assets/favicon.png` — the same mark, used as the browser-tab icon.
- `assets/global-shapers-pittsburgh-logo.png` — the **full official lockup** (ring + "GLOBAL SHAPERS PITTSBURGH"), kept here in case you want to use the complete logo elsewhere (letterhead, social, a larger footer treatment).

All three were generated from the official logo you provided.

---

## Files in this bundle

```
index.html                         the website (single page)
optimize-photos.py                 the photo tool
requirements.txt                   Python libraries the tool needs
photos-incoming/                   ← drop your photos here
assets/
  bridge.png                       hero bridge mark
  gs-pittsburgh-mark.png           official ring "C" mark (nav/footer)
  favicon.png                      browser-tab icon
  global-shapers-pittsburgh-logo.png   full official lockup (spare)
  photos/                          optimized photos land here (auto-managed)
```
