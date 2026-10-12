# CulturePGH

CulturePGH is the locals' guide to Pittsburgh's immigrant-owned restaurants, a
project of the Global Shapers Pittsburgh Hub. Everything here is plain static
HTML, CSS and JS. There is no build step: edit a JSON file, commit, and the
site updates.

## Pages

| URL | File | What it shows |
| --- | --- | --- |
| `/culturepgh/` | `index.html` | Home: hero, featured partners, about, next dinner, email signup |
| `/culturepgh/restaurants/` | `restaurants/index.html` | The guide: filters, map, all places, "Suggest a Spot" form |
| `/culturepgh/restaurant/?slug=tramas` | `restaurant/index.html` | One profile page template, filled in from `restaurants.json` |
| `/culturepgh/dinners/` | `dinners/index.html` | Occasional dinners, from `dinners.json` |
| `/culturepgh/for-restaurants/` | `for-restaurants/index.html` | The three participation tiers and a contact form |

The shared look lives in `culturepgh.css` and the shared behavior in
`culturepgh.js`. The CulturePGH Instagram handle lives in `settings.json`
(`"instagram": "handle"`, without the @). Instagram links stay hidden until
it's filled in.

**The easy way to edit any of this is the admin page,
[`/admin/culturepgh.html`](../admin/culturepgh.html).** Sign in at
`/shapers.html` with an admin account, connect your GitHub token, and you can
add and edit restaurants (with photo uploads), dinners, and settings, then
publish with one button. The rest of this file documents the underlying
JSON for anyone editing it by hand.

## Adding a restaurant

1. Open `culturepgh/restaurants.json`. You can edit it directly on GitHub
   with the pencil icon.
2. Copy an existing entry inside the `"restaurants": [ ... ]` list and paste
   it after it. Mind the commas between entries.
3. Fill in the fields below. At minimum you need `slug`, `name`, `status`
   and `type`. Anything you don't know yet can be left as `""` or `null`, or
   as a `"TODO: ..."` note. The site treats all three as empty and shows a
   tidy fallback instead.
4. For photos, make a folder `assets/culturepgh/<slug>/` and upload them
   there. Keep them reasonably small: about 1600px on the long edge, JPG or
   WEBP. The repo's `optimize-photos.py` tool or any image resizer works.
5. Commit. The profile is live at `/culturepgh/restaurant/?slug=<slug>`.

You can check that the file is still valid JSON by pasting it into any JSON
validator, or with `python3 -m json.tool culturepgh/restaurants.json`.

### Fields

| Field | Required | Example | Notes |
| --- | --- | --- | --- |
| `slug` | yes | `"tramas"` | Lowercase letters, numbers and hyphens. Used in the URL. Must be unique. Don't change it once shared. |
| `name` | yes | `"Tramas"` | |
| `status` | yes | `"featured"` or `"listed"` | `featured`: we've visited, gathered media, and the owner is a partner. Gets the "Featured partner" badge. `listed`: on our radar only, shown as "On our radar" with a note that it isn't a partner. |
| `tier` | no | `1`, `2`, `3` or `null` | The participation tier the owner chose. 1 = listed in the guide, 2 = full feature, 3 = hosts a dinner. `null` if the owner hasn't signed up for anything yet. This is for our records and isn't shown on the site. |
| `type` | yes | `"restaurant"` | One of the keys in the top-level `types` object: `restaurant`, `cafe`, `market`. Drives the Type filter and the pin color. |
| `cuisine` | no | `"Nepali"` | The specific cuisine. Shown on cards and profiles. |
| `cuisineGroup` | no | `"Asian"` | The broad group used only by the Cuisine filter. Use one from the top-level `cuisineGroups` list. |
| `neighborhood` | no | `"Brentwood"` | Drives the Neighborhood filter. Spell it the same way each time. |
| `address` | no | `"3536 Saw Mill Run Blvd, Pittsburgh, PA 15227"` | Shown with a "Get directions" link. |
| `lat`, `lng` | no | `40.37277`, `-79.98209` | Numbers, not strings. Places without them still appear in the list, just not on the map. To get them, right-click the spot in Google Maps and click the coordinates to copy them. |
| `website` | no | `"https://example.com/"` | Must start with `https://` or `http://`. |
| `instagram` | no | `"examplehandle"` | The handle without `@`. A full instagram.com URL also works. |
| `blurb` | no | `"Family-run Thai kitchen..."` | One sentence for the guide card. |
| `owner` | no | `{ "name": "Tom", "headshot": "assets/culturepgh/tramas/tom.jpg", "bio": "..." }` | Or `null`. With a name but no headshot, the page shows initials. With no bio, it shows "We're still writing up...". |
| `story` | no | `"First paragraph.\n\nSecond paragraph."` | The longer story. Separate paragraphs with `\n\n`. |
| `heroImage` | no | `{ "src": "assets/culturepgh/tramas/hero.jpg", "alt": "Describe the photo" }` | Or `null`. The big photo at the top of the profile and on the card. |
| `gallery` | no | `[ { "src": "...", "alt": "..." } ]` | Food photos. Always write alt text describing the dish. |

Image paths are relative to the site root (start with `assets/...`). Full
`https://` URLs also work.

Fields starting with `_` (like `_todo` or `_readme`) are notes for the team
and are ignored by the site.

### Adding a cuisine group, type or neighborhood

- **Neighborhood:** just use it in an entry. The filter is built from the
  data.
- **Cuisine group:** use it in an entry's `cuisineGroup`. It appears in the
  filter automatically. Add it to the top-level `cuisineGroups` list too, so
  it's sorted where you want it.
- **Type:** add it to the top-level `types` object with a display label. For
  a new map pin color, add a `.cpgh-pin.<type>` rule in `culturepgh.css`.

## Dinners

Edit `culturepgh/dinners.json`. While `"dinners"` is empty, the site shows
"Next dinner coming soon" with an email signup link.

```json
{
  "dinners": [
    {
      "title": "Dinner at Tramas",
      "status": "upcoming",
      "date": "2027-01-21",
      "dateLabel": "",
      "restaurant": "tramas",
      "summary": "One or two sentences about the night.",
      "ticketUrl": "https://...",
      "photo": null
    }
  ]
}
```

- `status`: `"upcoming"` or `"past"`. Past dinners appear under "Where we've been".
- `date` is `YYYY-MM-DD`. Use `dateLabel` instead for something looser,
  like `"Late January 2027"`.
- `restaurant` is the restaurant's `slug`, which links to its profile.
- `ticketUrl` is optional. A "Get tickets" link appears when it's set.
- `photo` is `{ "src": "...", "alt": "..." }` or `null`.

## Moving to static pages later

Profiles are rendered in the browser from `restaurant/?slug=...`. If SEO or
link previews start to matter, the render functions in `culturepgh.js`
(`renderProfile`, `renderCard` and friends) are pure: data in, HTML string
out. A small Node script could load `restaurants.json`, call them, and write
`restaurant/<slug>/index.html` for each entry with proper `<title>` and
Open Graph tags. `profileUrl()` is the one place that builds profile links.
