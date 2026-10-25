# CLAUDE.md: gearity.github.io

Jacob Gearity's personal site. GitHub Pages serves the `main` branch root of https://github.com/gearity/gearity.github.io, so every push redeploys https://gearity.github.io/. Windmill is a separate repo served at /windmill/; don't add a `windmill/` folder here or it will shadow the game.

The audience is MLB and NFL front office and R&D staff, so the projects lead and every number has to match its source.

## Writing

All copy follows Jacob's anti-AI writing guide (`C:\Users\Jacob\Desktop\anti-ai-writing-guide.md`): no em dashes, no "not X but Y," no stock AI vocabulary, no captions or notes explaining what the page already shows, sentence case, straight quotes. The experience rows are first person. Date ranges use an unspaced en dash (`2025–26`, `2026–now`).

## Design

Same board as Windmill: tokens, fonts (Saira Stencil One, Barlow Condensed, Barlow) and the riveted header are copied from `windmill/css/style.css`. If Windmill's palette changes, change `:root` here too. Big stencil numbers in signal yellow are for real findings only. The two projects are laid out differently on purpose (image beside text for Windmill, a panel for the Scottie Effect).

Breakpoints: 900px stacks the two-column blocks; 640px turns the experience table into stacked rows and hides the header subtitle. Nothing should scroll sideways at 375px.

## Files

```
index.html              home: intro, Windmill, Scottie Effect, experience, school and tools
scottie-effect.html     write-up of the May 3, 2026 LinkedIn post; served at /scottie-effect
404.html                uses root-relative paths because Pages serves it at any URL
edit.js                 edit mode for this site and Windmill, loaded only with ?edit
css/style.css           all styles
img/windmill-field.png  field crop from windmill/og-image.png (x 552, y 28, 626x574)
img/scottie-effect-card.png, og-image.png   1200x630 social cards
jacob-gearity-resume.pdf   2026 resume (includes phone and ZIP; the pages themselves don't show the phone)
```

## Facts and sources

- Resume (2026) is the source for roles, dates, GPA 3.6 and graduation (eligible May 2027). LinkedIn is linkedin.com/in/jacob-gearity; the old -b93112331 URL is gone.
- Windmill numbers come from its README: 8,982 decisions, nobody out sends 48% of the time and score 97.6% against a 74% breakeven.
- Scottie Effect numbers come from the LinkedIn post: 284 rounds at 0.89 under par, 1,195 at 1.53 under, p = 0.0027. The package is `golfastr` (github.com/array-carpenter/golfastr). Young shot 68 and won the 2026 Cadillac Championship by six; Scheffler shot 68 and was second.

## Edit mode

Jacob rewrites text on both sites himself, often. Any page opened with `?edit` (gearity.github.io/?edit, gearity.github.io/windmill/?edit) loads `/edit.js` through a one-line loader at the end of the page; visitors never load it. He picks text on the page or opens "All text" (tab title, search and link-preview descriptions, and Windmill's `js/copy.js`), rewrites it with a live preview, and saves. Each changed file becomes one commit on `main` through the GitHub contents API, authored as Jacob with his noreply email. The token is a fine-grained one with Contents read and write on both repos, pasted once and kept in `localStorage` (`gearity.editToken`). Both sites share the gearity.github.io origin, so one token covers both.

How text is matched to a file:

- Static text is found in the page's HTML file by its exact source, `>text<` for a text node or `>inner HTML</tag>` for an element with links or tags inside. Text that appears more than once is matched by its order on the page, and only when the page and the file have the same number of copies.
- Text a script writes comes from the site's `js/copy.js` (`window.COPY`). Each entry's `{slots}` are wildcards when matching what's on screen, and when several entries fit, the one with the most fixed text wins. Entries must stay one per line with double-quoted values.
- The page maps to its repo by path: `/windmill/...` is the windmill repo, everything else is this one. A new project repo served under gearity.github.io needs adding to `PROJECTS` in `edit.js`.

It only works on the live site, since it loads `/edit.js` from the root and reads the files from GitHub; opened from `file://`, `?edit` does nothing. Commits land on GitHub first, so pull before working locally. Pages can take a minute or two to show a save, and a page loaded before then won't match the new file, which the editor reports as text it can't find.

To test without committing, serve both repos on one local origin (`/windmill/` from the Windmill folder), replace `window.fetch` for `api.github.com/.../contents/...` with a stub that serves the local files and records PUT bodies, then add `/edit.js` to the page.

## Social cards

The cards were rendered from small HTML pages with headless Edge:

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=8000 --screenshot=out.png file:///path/to/card.html
```

Headless Edge won't lay out narrower than about 500px, so check phone widths in the in-app browser at the mobile preset and measure `scrollWidth` in JS.
