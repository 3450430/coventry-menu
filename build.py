#!/usr/bin/env python3
"""Builds the GitHub site copy and the single-file standalone planner from index.html, app.js, week-data.js/json."""
import json, re, shutil, sys, pathlib
src = pathlib.Path(__file__).parent
repo = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
RAW = "https://raw.githubusercontent.com/3450430/coventry-menu/main/week-data.json"
html = (src / "index.html").read_text()
app = (src / "app.js").read_text()
week = json.loads((src / "week-data.json").read_text())
tail = '<script src="week-data.js"></script>\n<script src="app.js"></script>'
assert tail in html
# 1) site copy for the repository (works on GitHub Pages or any web host)
site = html.replace(tail, '<script>window.MENU_STANDALONE = true;</script>\n' + tail)
(repo / "index.html").write_text(site)
for f in ("app.js", "week-data.js", "week-data.json"):
    shutil.copy(src / f, repo / f)
# 2) single-file standalone planner
embed = json.dumps(week, ensure_ascii=False).replace("</", "<\\/")
assert "</script" not in app
loader = """<script>
window.MENU_STANDALONE = true;
var EMBED = %s;
function startApp() {
%s
}
(function () {
  var URL_ = "%s", KEY = "coventry-menu-latest", done = false, best = EMBED, cached = null;
  function valid(w) { return w && w.weekStart && w.refreshed && w.recipes && w.ingredients && w.days && w.days.length === 7; }
  try { cached = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  if (valid(cached) && cached.refreshed > EMBED.refreshed) best = cached;
  function go(w, note) { if (done) return; done = true; window.WEEK = w; window.MENU_SOURCE = note; try { startApp(); } catch (e) { if (w !== EMBED) { window.WEEK = EMBED; window.MENU_SOURCE = "built-in week (update could not be read)"; startApp(); } else { throw e; } } }
  var offline = function () { go(best, best === EMBED ? "offline, built-in week" : "offline, last saved week"); };
  var timer = setTimeout(offline, 7000);
  try {
    fetch(URL_ + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (w) {
      clearTimeout(timer);
      if (valid(w) && w.refreshed >= best.refreshed) { try { localStorage.setItem(KEY, JSON.stringify(w)); } catch (e) {} go(w, "latest week loaded online"); } else offline();
    }).catch(function () { clearTimeout(timer); offline(); });
  } catch (e) { clearTimeout(timer); offline(); }
})();
</script>""" % (embed, app, RAW)
single = html.replace(tail, loader)
single = single.replace('<link rel="preconnect" href="https://fonts.googleapis.com">\n', '')
out.write_text(single)
print("site ->", repo, "| standalone ->", out, len(single) // 1024, "KB")
