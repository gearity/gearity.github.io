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
css/style.css           all styles
img/windmill-field.png  field crop from windmill/og-image.png (x 552, y 28, 626x574)
img/scottie-effect-card.png, og-image.png   1200x630 social cards
jacob-gearity-resume.pdf   2026 resume (includes phone and ZIP; the pages themselves don't show the phone)
```

## Facts and sources

- Resume (2026) is the source for roles, dates, GPA 3.6 and graduation (eligible May 2027). LinkedIn is linkedin.com/in/jacob-gearity; the old -b93112331 URL is gone.
- Windmill numbers come from its README: 8,982 decisions, nobody out sends 48% of the time and score 97.6% against a 74% breakeven.
- Scottie Effect numbers come from the LinkedIn post: 284 rounds at 0.89 under par, 1,195 at 1.53 under, p = 0.0027. The package is `golfastr` (github.com/array-carpenter/golfastr). Young shot 68 and won the 2026 Cadillac Championship by six; Scheffler shot 68 and was second.

## Social cards

The cards were rendered from small HTML pages with headless Edge:

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=8000 --screenshot=out.png file:///path/to/card.html
```

Headless Edge won't lay out narrower than about 500px, so check phone widths in the in-app browser at the mobile preset and measure `scrollWidth` in JS.
