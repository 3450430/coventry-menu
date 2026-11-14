# Coventry Menu Planner

Weekly menu planner for Coventry Royal Care LLC (Glendale, AZ).

- `week-data.json` / `week-data.js` — the current week's menu, recipes and flyer prices. Replaced every Saturday.
- `index.html`, `app.js` — the planner itself.
- `build.py` — rebuilds the site copy and the single-file standalone planner.

The standalone planner file reads `week-data.json` from this repository each time it is opened.
