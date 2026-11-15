/* Menu planner logic. Reads window.WEEK (week-data.js). Pure calculation functions first, DOM after. */
(function (root) {
  "use strict";
  var W = root.WEEK;
  var SIZES = [2, 4, 6, 8, 10];
  var SLOTS = ["breakfast", "lunch", "dinner"];
  var SNACK_TIMES = ["10:00 AM", "3:00 PM", "8:00 PM"];
  var GROUPS = [["fruit", "Fruit", "cups"], ["veg", "Vegetables", "cups"], ["grains", "Grains", "oz"], ["prot", "Protein foods", "oz"], ["dairy", "Dairy", "cups"]];

  function ing(id) { var a = W.ingredients[id]; return { id: id, name: a[0], unit: a[1], price: a[2], store: a[3], kind: a[4], src: a[5], note: a[6] }; }
  function recipeCost(rid, n) { var t = 0; W.recipes[rid].items.forEach(function (it) { t += it[1] * W.ingredients[it[0]][2]; }); return t * n / 10; }
  function perResident(rid) { return recipeCost(rid, 10) / 10; }
  function money(x) { return "$" + x.toFixed(2); }
  function qty(q) {
    var r = q < 3 ? Math.round(q * 4) / 4 : q < 20 ? Math.round(q * 2) / 2 : Math.round(q);
    if (r === 0) r = 0.25;
    var whole = Math.floor(r), f = r - whole, fr = f === 0.25 ? "¼" : f === 0.5 ? "½" : f === 0.75 ? "¾" : "";
    return (whole ? whole : "") + fr || "0";
  }
  function unitLabel(u, q) { var plural = { egg: "eggs", can: "cans", bag: "bags", jar: "jars", pack: "packs", tub: "tubs", box: "boxes", sleeve: "sleeves", packet: "packets", stalk: "stalks", slice: "slices", cup: "cups", serving: "servings" }; return q > 1 && plural[u] ? plural[u] : u; }
  function saleItems(rid) { return W.recipes[rid].items.filter(function (it) { var i = W.ingredients[it[0]]; return i[4] === "sale" && it[0] !== "pantry"; }); }
  function topDeals(rid) {
    return saleItems(rid).map(function (it) { var i = ing(it[0]); return { i: i, spend: it[1] * i.price }; })
      .sort(function (a, b) { return b.spend - a.spend; }).slice(0, 2).map(function (x) { return x.i; });
  }

  function defaultState() {
    return { n: 10, sel: W.days.map(function (d) { return { breakfast: d.breakfast[0], lunch: d.lunch[0], dinner: d.dinner[0], snacks: d.snacks.slice() }; }) };
  }
  function picks(state) {
    var out = [];
    state.sel.forEach(function (s, di) {
      out.push({ di: di, slot: "Breakfast", rid: s.breakfast });
      out.push({ di: di, slot: "Snack " + SNACK_TIMES[0], rid: s.snacks[0] });
      out.push({ di: di, slot: "Lunch", rid: s.lunch });
      out.push({ di: di, slot: "Snack " + SNACK_TIMES[1], rid: s.snacks[1] });
      out.push({ di: di, slot: "Dinner", rid: s.dinner });
      out.push({ di: di, slot: "Snack " + SNACK_TIMES[2], rid: s.snacks[2] });
    });
    return out;
  }
  function dayCost(state, di, n) { var t = W.daily.costPerResident * n; picks(state).forEach(function (p) { if (p.di === di) t += recipeCost(p.rid, n); }); return t; }
  function weekCost(state, n) { var t = 0; for (var d = 0; d < W.days.length; d++) t += dayCost(state, d, n); return t; }
  function shopping(state, n) {
    var m = {};
    picks(state).forEach(function (p) { W.recipes[p.rid].items.forEach(function (it) { m[it[0]] = (m[it[0]] || 0) + it[1] * n / 10; }); });
    return Object.keys(m).map(function (id) { var i = ing(id); return { i: i, q: m[id], cost: m[id] * i.price }; });
  }
  function byStore(list) {
    var g = {};
    list.forEach(function (x) { (g[x.i.store] = g[x.i.store] || []).push(x); });
    return Object.keys(g).map(function (s) {
      var items = g[s].sort(function (a, b) { return b.cost - a.cost; });
      return { store: s, items: items, total: items.reduce(function (t, x) { return t + x.cost; }, 0) };
    }).sort(function (a, b) { return b.total - a.total; });
  }
  function saleShare(list) { var s = 0, t = 0; list.forEach(function (x) { t += x.cost; if (x.i.kind === "sale") s += x.cost; }); return t ? s / t : 0; }
  function dayNutrition(state, di) {
    var t = { kcal: 0, protein: 0, sodium: 0, fruit: 0, veg: 0, grains: 0, prot: 0, dairy: 0 };
    var add = function (n) { Object.keys(t).forEach(function (k) { t[k] += n[k] || 0; }); };
    add(W.daily.n);
    picks(state).forEach(function (p) { if (p.di === di) add(W.recipes[p.rid].n); });
    return t;
  }
  function addDays(iso, n) { var p = iso.split("-"); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); d.setUTCDate(d.getUTCDate() + n); return d; }
  function fmtDate(d) { return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()] + ", " + (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + "/" + d.getUTCFullYear(); }
  function grade(v, target) { var r = v / target; return r >= 0.9 ? "ok" : r >= 0.75 ? "close" : "low"; }
  function dayChecks(state, di) {
    var n = dayNutrition(state, di), T = W.targets, out = [];
    GROUPS.forEach(function (g) { out.push({ key: g[0], label: g[1], unit: g[2], value: n[g[0]], target: T[g[0]], status: grade(n[g[0]], T[g[0]]) }); });
    out.push({ key: "kcal", label: "Calories", unit: "kcal", value: n.kcal, target: T.kcalMin + "–" + T.kcalMax, status: n.kcal >= T.kcalMin * 0.98 && n.kcal <= T.kcalMax * 1.1 ? "ok" : "close" });
    out.push({ key: "sodium", label: "Sodium", unit: "mg", value: n.sodium, target: "under " + T.sodiumMax, status: n.sodium <= T.sodiumMax ? "ok" : n.sodium <= T.sodiumMax * 1.15 ? "close" : "low" });
    out.protein = n.protein;
    return out;
  }
  function usedRecipes(state) { var seen = {}, out = []; picks(state).forEach(function (p) { if (!seen[p.rid]) { seen[p.rid] = 1; out.push(p.rid); } }); return out; }

  /* ---------- printable documents (self-contained HTML strings) ---------- */
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var FAC = { name: W.facility.name, address: W.facility.address, contact: W.facility.contact };
  function setFacility(f) { FAC = { name: f.name || "", address: f.address || "", contact: f.contact || "" }; }
  function docShell(title, footerName, landscape, body) {
    var foot = esc(footerName).replace(/"/g, "'") + ' • Page " counter(page) " of " counter(pages) " • ' + esc(FAC.name).replace(/"/g, "'");
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      '@page{size:letter ' + (landscape ? "landscape" : "portrait") + ';margin:0.45in 0.5in 0.65in;@bottom-center{content:"' + foot + '";font:italic 7.5pt Arial,Helvetica,sans-serif;color:#5C3D1E;border-top:0.75pt solid #5C3D1E;padding-top:3pt}}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font:9.5pt Arial,Helvetica,sans-serif;color:#2C1A0E;margin:0}' +
      '.lh{background:#5C3D1E;color:#fff;text-align:center;padding:4pt 6pt 3pt}.lh h1{font-size:14pt;margin:0;text-transform:uppercase;letter-spacing:.3px}.lh div{font-size:8pt;line-height:1.25}' +
      '.band{background:#7B5B3A;color:#fff;text-align:center;font-weight:bold;font-size:12pt;padding:2pt 6pt;margin:3pt 0 6pt;text-transform:uppercase}' +
      'h2{font-size:11pt;margin:14px 0 6px;background:#7B5B3A;color:#fff;padding:3pt 6pt}h3{font-size:10.5pt;margin:12px 0 4px;color:#5C3D1E}' +
      '.c{text-align:center}.sm{font-size:8.5pt}.mut{color:#5C3D1E}.sub{text-align:center;font-weight:bold;font-size:8.5pt;color:#5C3D1E;margin:0 0 2pt}.wk{text-align:center;font-size:8pt;margin:0 0 6pt}' +
      'table{border-collapse:collapse;width:100%}th,td{border:0.75pt solid #C8963E;padding:4px 6px;vertical-align:top;text-align:left}th{background:#5C3D1E;color:#fff}td.r,th.r{text-align:right}tbody tr:nth-child(even) td,table.z tr:nth-child(even) td{background:#F5EDE3}tr.tot th,tr.tot td{background:#7B5B3A;color:#fff;font-weight:bold}' +
      '.menu{table-layout:fixed}.menu th{text-align:center;font-size:7.5pt;padding:4px 3px}.menu td{text-align:center;vertical-align:middle;font-size:8.5pt;padding:7px 4px;line-height:1.25;background:#fff}.menu td:nth-child(even){background:#F5EDE3}.menu td.h{background:#7B5B3A;color:#fff;font-weight:bold;font-size:7pt;width:6.5%}.menu b{font-weight:bold}' +
      '.fluid{text-align:center;font-weight:bold;font-size:8pt;color:#5C3D1E;margin:6pt 0 0}' +
      '.recipe{break-inside:avoid;margin-bottom:12px;border:0.75pt solid #C8963E}.recipe h3{margin:0;background:#5C3D1E;color:#fff;padding:4pt 8pt}.recipe .in{padding:6px 10px 8px}.cols{display:flex;gap:18px;margin-top:4px}.cols>div:first-child{flex:0 0 38%}ol,ul{margin:4px 0;padding-left:20px}li{margin-bottom:3px}' +
      '.bar{background:#F5EDE3;border:0.75pt solid #C8963E;padding:5px 8px;margin:8px 0}.noprint{margin:0 0 10px;padding:8px;background:#F5EDE3;border:1px solid #C8963E;font-size:10pt}@media print{.noprint{display:none}}' +
      '</style></head><body><div class="noprint">To print: press <b>⌘P</b> on a Mac or <b>Ctrl+P</b> on Windows. Choose ' + (landscape ? "Landscape" : "Portrait") + ', US Letter, and turn on “Background graphics” so the brown bands print.</div>' + body + '</body></html>';
  }
  function letterhead(title) { return '<div class="lh"><h1>' + esc(FAC.name) + '</h1><div>' + esc(FAC.address) + '</div><div>' + esc(FAC.contact) + '</div></div><div class="band">' + title + '</div>'; }
  function menuDoc(state) {
    var sel = state.sel, R = W.recipes;
    var row = function (label, fn) { return '<tr><td class="h">' + label + '</td>' + W.days.map(function (d, i) { return '<td>' + fn(sel[i], i) + '</td>'; }).join("") + '</tr>'; };
    var snack = function (k) { return function (s) { return 'Snacks &amp; Hydration served at ' + SNACK_TIMES[k] + '<br>' + esc(R[s.snacks[k]].name); }; };
    var body = letterhead('7-Day Menu &nbsp;•&nbsp; *Substitutions are allowed*') +
      '<p class="sub">Each day must meet the Basic Four food group requirements and dietary guidelines</p>' +
      '<p class="wk">7-Day Menu #: ' + esc(W.menuNumber) + ' &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Week of: ' + esc(W.weekLabel) + '</p>' +
      '<table class="menu"><tr><th>Day</th>' + W.days.map(function (d) { return '<th>' + d.day + '</th>'; }).join("") + '</tr>' +
      row("BREAKFAST", function (s) { return 'Coffee, Tea, Juice, Milk<br>' + esc(R[s.breakfast].name); }) +
      row("SNACK", snack(0)) +
      row("LUNCH", function (s) { return esc(R[s.lunch].name); }) +
      row("SNACK", snack(1)) +
      row("DINNER", function (s) { return esc(R[s.dinner].name) + '<br>Milk'; }) +
      row("SNACK", snack(2)) + '</table>' +
      '<p class="fluid">Fluid Intake: Encourage/Serve residents to drink 6–8 glasses of water a day</p>';
    return docShell("7-Day Menu " + W.weekLabel, "Administrative Forms: 7-Day Menu", true, body);
  }
  function reportDoc(state) {
    var n = state.n, R = W.recipes, list = shopping(state, n), tot = weekCost(state, n), h = "";
    h += letterhead('Weekly Menu Cost Report') + '<p class="wk">Week of ' + esc(W.weekLabel) + ' &nbsp;•&nbsp; ' + n + ' residents</p>';
    h += '<table><tr><th>Total food cost for the week</th><th>Per resident, per week</th><th>Per resident, per day</th><th>Share of spend at verified flyer prices</th></tr><tr><td>' + money(tot) + '</td><td>' + money(tot / n) + '</td><td>' + money(tot / n / 7) + '</td><td>' + Math.round(saleShare(list) * 100) + '%</td></tr></table>';
    h += '<p class="sm mut">' + esc(W.flyerWindow) + ' Costs are for the amount used (pro-rated), not whole packages. Items marked est. are typical shelf prices, not flyer prices.</p>';
    h += '<h2>Cost per resident for each meal and snack</h2><table><tr><th>Day</th><th>Meal</th><th>Menu item</th><th class="r">Per resident</th><th class="r">For ' + n + '</th></tr>';
    W.days.forEach(function (d, di) {
      picks(state).filter(function (p) { return p.di === di; }).forEach(function (p, k) {
        h += '<tr><td>' + (k === 0 ? '<b>' + d.day + ' ' + d.date + '</b>' : '') + '</td><td>' + p.slot + '</td><td>' + esc(R[p.rid].name) + '</td><td class="r">' + money(perResident(p.rid)) + '</td><td class="r">' + money(recipeCost(p.rid, n)) + '</td></tr>';
      });
      h += '<tr><td></td><td>All day</td><td>' + esc(W.daily.label) + '</td><td class="r">' + money(W.daily.costPerResident) + '</td><td class="r">' + money(W.daily.costPerResident * n) + '</td></tr>';
      h += '<tr class="tot"><th colspan="3">' + d.day + ' total</th><th class="r">' + money(dayCost(state, di, 1)) + '</th><th class="r">' + money(dayCost(state, di, n)) + '</th></tr>';
    });
    h += '</table><h2>Shopping list by store (' + n + ' residents)</h2>';
    byStore(list).forEach(function (g) {
      h += '<h3>' + esc(g.store) + ' — ' + money(g.total) + '</h3><table><tr><th>Item</th><th class="r">Amount needed</th><th class="r">Unit price</th><th class="r">Cost</th><th>Price type</th></tr>';
      g.items.forEach(function (x) { h += '<tr><td>' + esc(x.i.name) + '</td><td class="r">' + qty(x.q) + ' ' + unitLabel(x.i.unit, x.q) + '</td><td class="r">' + money(x.i.price) + '/' + x.i.unit + '</td><td class="r">' + money(x.cost) + '</td><td>' + (x.i.kind === "sale" ? "Flyer price" : "est.") + '</td></tr>'; });
      h += '</table>';
    });
    h += '<h2>Ingredients for 2, 4, 6, 8 and 10 residents</h2><table><tr><th>Ingredient</th><th>Unit</th>' + SIZES.map(function (s) { return '<th class="r">' + s + '</th>'; }).join("") + '</tr>';
    shopping(state, 10).sort(function (a, b) { return a.i.name < b.i.name ? -1 : 1; }).forEach(function (x) { h += '<tr><td>' + esc(x.i.name) + '</td><td>' + x.i.unit + '</td>' + SIZES.map(function (s) { return '<td class="r">' + qty(x.q * s / 10) + '</td>'; }).join("") + '</tr>'; });
    h += '<tr class="tot"><th colspan="2">Week total (incl. daily beverages)</th>' + SIZES.map(function (s) { return '<th class="r">' + money(weekCost(state, s)) + '</th>'; }).join("") + '</tr></table>';
    h += '<h2>Daily food group check</h2><p class="sm mut">Targets: 2015–2020 Dietary Guidelines, 1,800-calorie pattern (the guideline named in A.A.C. R9-10-817). Values are planning estimates, not a dietitian\'s analysis.</p><table><tr><th>Day</th>' + GROUPS.map(function (g) { return '<th class="r">' + g[1] + ' (' + W.targets[g[0]] + ' ' + g[2] + ')</th>'; }).join("") + '<th class="r">Calories</th><th class="r">Protein g</th><th class="r">Sodium mg</th></tr>';
    W.days.forEach(function (d, di) { var c = dayChecks(state, di); h += '<tr><td>' + d.day + '</td>' + c.slice(0, 5).map(function (x) { return '<td class="r">' + x.value.toFixed(1) + (x.status === "ok" ? "" : " ▲") + '</td>'; }).join("") + '<td class="r">' + Math.round(c[5].value) + '</td><td class="r">' + Math.round(c.protein) + '</td><td class="r">' + Math.round(c[6].value) + (c[6].status === "ok" ? "" : " ▲") + '</td></tr>'; });
    h += '</table><p class="sm">▲ = below target (or sodium above 2,300 mg). Add a vegetable side or swap a snack on those days.</p>';
    h += '<h2>Price sources</h2><ul class="sm">' + Object.keys(W.sources).map(function (k) { var s = W.sources[k]; return '<li>' + esc(s.store) + ': ' + esc(s.label) + ' — ' + esc(s.url) + '</li>'; }).join("") + '</ul>';
    return docShell("Weekly Menu Cost Report " + W.weekLabel, "Weekly Menu Cost Report", false, h);
  }
  function recipeBlock(rid, n) {
    var r = W.recipes[rid], h = '<div class="recipe"><h3>' + esc(r.name) + '</h3><div class="in"><div class="sm mut">Makes ' + n + ' servings • ' + money(perResident(rid)) + ' per resident';
    if (r.src) h += ' • Based on ' + esc(r.src[0]) + ', rated ' + r.src[2].toFixed(2) + '/5 from ' + r.src[3].toLocaleString() + ' ratings';
    h += '</div><div class="cols"><div><b>Ingredients</b><ul>' + r.items.filter(function (it) { return it[0] !== "pantry"; }).map(function (it) { var i = ing(it[0]), q = it[1] * n / 10; return '<li>' + qty(q) + ' ' + unitLabel(i.unit, q) + ' — ' + esc(i.name.replace(/\s*\(.*\)$/, "")) + '</li>'; }).join("") + '</ul></div><div><b>Method</b><ol>' + r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ol>';
    if (r.temp) h += '<div class="bar sm"><b>Safe temperature:</b> ' + esc(r.temp) + '</div>';
    if (r.src) h += '<div class="sm">Source: ' + esc(r.src[1]) + '</div>';
    return h + '</div></div></div></div>';
  }
  function recipesDoc(state) {
    var h = letterhead('Recipes for the week') + '<p class="wk">Week of ' + esc(W.weekLabel) + ' &nbsp;•&nbsp; scaled for ' + state.n + ' residents</p><p class="sm mut">Amounts in the method are written for 10 residents; scale seasonings with the ingredient list. Seasonings, oil and garlic come from the pantry.</p>';
    usedRecipes(state).forEach(function (rid) { if (W.recipes[rid].steps.length > 1) h += recipeBlock(rid, state.n); });
    return docShell("Recipes " + W.weekLabel, "Weekly Recipes", false, h);
  }

  var API = { W: W, SIZES: SIZES, ing: ing, recipeCost: recipeCost, perResident: perResident, money: money, qty: qty, defaultState: defaultState, picks: picks, dayCost: dayCost, weekCost: weekCost, shopping: shopping, byStore: byStore, saleShare: saleShare, dayNutrition: dayNutrition, dayChecks: dayChecks, usedRecipes: usedRecipes, menuDoc: menuDoc, reportDoc: reportDoc, recipesDoc: recipesDoc, setFacility: setFacility };
  if (typeof module !== "undefined") { module.exports = API; return; }

  /* ------------------------------ page ------------------------------ */
  var KEY = "coventry-menu-" + W.weekStart, state = defaultState();
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved && saved.sel && saved.sel.length === W.days.length && saved.sel.every(function (s) { return W.recipes[s.breakfast] && W.recipes[s.lunch] && W.recipes[s.dinner] && s.snacks.every(function (x) { return W.recipes[x]; }); })) state = saved; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var HKEY = "menu-planner-homes", homes = { list: [{ name: W.facility.name, address: W.facility.address, contact: W.facility.contact }], cur: 0 }, homeMsg = "";
  try { var hs = JSON.parse(localStorage.getItem(HKEY) || "null"); if (hs && hs.list && hs.list.length && hs.list.every(function (h) { return h && typeof h.name === "string" && h.name; })) homes = { list: hs.list, cur: Math.min(Math.max(+hs.cur || 0, 0), hs.list.length - 1) }; } catch (e) {}
  function saveHomes() { try { localStorage.setItem(HKEY, JSON.stringify(homes)); return true; } catch (e) { return false; } }
  function applyHome() { setFacility(homes.list[homes.cur]); }
  applyHome();
  function homesBlock() {
    var h = homes.list[homes.cur];
    return '<section class="homes"><h2>Home on printed documents</h2><p class="note">The name, address and contact line below print at the top of the 7-Day Menu, cost report and recipes. Coventry Royal Care is preloaded. Add your other homes once and pick one before printing. Homes you add are saved in this browser on this computer.</p>' +
      '<div class="home-row"><label for="home-sel">Print for</label><select id="home-sel">' + homes.list.map(function (x, i) { return '<option value="' + i + '"' + (i === homes.cur ? " selected" : "") + '>' + esc(x.name) + '</option>'; }).join("") + '</select></div>' +
      '<div class="home-form"><label for="home-name">Home name<input id="home-name" type="text" value="' + esc(h.name) + '" autocomplete="off"></label><label for="home-address">Address line<input id="home-address" type="text" value="' + esc(h.address) + '" placeholder="Street • City, AZ ZIP" autocomplete="off"></label><label for="home-contact">Contact line<input id="home-contact" type="text" value="' + esc(h.contact) + '" placeholder="Business: (000) 000-0000 • Fax: (000) 000-0000 • email" autocomplete="off"></label></div>' +
      '<div class="print-btns"><button type="button" class="primary" id="home-save">Save changes to this home</button><button type="button" id="home-add">Add as a new home</button>' + (homes.list.length > 1 ? '<button type="button" id="home-del">Remove this home</button>' : '') + '</div><p class="note" role="status" id="home-msg">' + esc(homeMsg) + '</p></section>';
  }
  function homeFields() { return { name: $("home-name").value.trim(), address: $("home-address").value.trim(), contact: $("home-contact").value.trim() }; }
  var $ = function (id) { return document.getElementById(id); };
  var R = W.recipes;

  function stars(src) { return src ? '<span class="rating" title="Rating on ' + esc(src[0]) + '">★ ' + src[2].toFixed(2) + ' <span class="mut">(' + src[3].toLocaleString() + ')</span></span>' : ''; }
  function optionCard(di, slot, rid) {
    var r = R[rid], on = state.sel[di][slot] === rid, deals = topDeals(rid);
    return '<button type="button" class="opt' + (on ? " on" : "") + '" data-di="' + di + '" data-slot="' + slot + '" data-rid="' + rid + '" aria-pressed="' + on + '">' +
      '<span class="opt-top"><span class="opt-name">' + esc(r.short) + '</span><span class="opt-price">' + money(perResident(rid)) + '</span></span>' +
      '<span class="opt-desc">' + esc(r.name) + '</span>' +
      '<span class="opt-meta">' + stars(r.src) + deals.map(function (d) { return '<span class="deal">' + esc(d.store) + ': ' + esc(d.name.split(",")[0].replace(/\s*\(.*\)$/, "")) + ' ' + money(d.price) + '/' + d.unit + '</span>'; }).join("") + '</span></button>';
  }
  function renderPlan() {
    var h = "";
    W.days.forEach(function (d, di) {
      var checks = dayChecks(state, di), bad = checks.filter(function (c) { return c.status !== "ok"; });
      h += '<section class="day"><header><h3>' + d.day + ' <span class="mut">' + d.date + '</span></h3><div class="day-sum"><span class="pill ' + (bad.length ? "warn" : "good") + '">' + (bad.length ? "Check: " + bad.map(function (c) { return c.label.toLowerCase(); }).join(", ") : "Food groups met") + '</span><b>' + money(dayCost(state, di, 1)) + '</b> per resident</div></header>';
      ["breakfast", "lunch", "dinner"].forEach(function (slot) {
        h += '<div class="meal"><div class="meal-label">' + slot + '</div><div class="opts">' + d[slot].map(function (rid) { return optionCard(di, slot, rid); }).join("") + '</div></div>';
      });
      h += '<div class="meal"><div class="meal-label">snacks</div><div class="snacks">' + SNACK_TIMES.map(function (t, k) {
        return '<label for="sn-' + di + '-' + k + '">' + t + '<select id="sn-' + di + '-' + k + '" data-di="' + di + '" data-k="' + k + '">' + W.snackOptions.map(function (s) { return '<option value="' + s + '"' + (state.sel[di].snacks[k] === s ? " selected" : "") + '>' + esc(R[s].short) + ' — ' + money(perResident(s)) + '</option>'; }).join("") + '</select></label>';
      }).join("") + '</div></div></section>';
    });
    $("plan").innerHTML = h;
  }
  function renderSummary() {
    var n = state.n, tot = weekCost(state, n), list = shopping(state, n);
    $("sum").innerHTML = '<div><span class="k">Week total, ' + n + ' residents</span><span class="v">' + money(tot) + '</span></div><div><span class="k">Per resident, per week</span><span class="v">' + money(tot / n) + '</span></div><div><span class="k">Per resident, per day</span><span class="v">' + money(tot / n / 7) + '</span></div><div><span class="k">Spend at verified flyer prices</span><span class="v">' + Math.round(saleShare(list) * 100) + '%</span></div>';
    Array.prototype.forEach.call(document.querySelectorAll("#sizes button"), function (b) { b.classList.toggle("on", +b.dataset.n === n); b.setAttribute("aria-pressed", +b.dataset.n === n); });
  }
  function renderCosts() {
    var n = state.n, h = '<h2>Cost per resident for each meal and snack</h2><div class="scroll"><table><thead><tr><th>Meal</th>' + W.days.map(function (d) { return '<th>' + d.day.slice(0, 3) + ' ' + d.date + '</th>'; }).join("") + '</tr></thead><tbody>';
    var rows = [["Breakfast", function (s) { return s.breakfast; }], ["Snack 10 AM", function (s) { return s.snacks[0]; }], ["Lunch", function (s) { return s.lunch; }], ["Snack 3 PM", function (s) { return s.snacks[1]; }], ["Dinner", function (s) { return s.dinner; }], ["Snack 8 PM", function (s) { return s.snacks[2]; }]];
    rows.forEach(function (r) { h += '<tr><th>' + r[0] + '</th>' + state.sel.map(function (s) { var rid = r[1](s); return '<td><span class="num">' + money(perResident(rid)) + '</span><span class="cell-sub">' + esc(R[rid].short) + '</span></td>'; }).join("") + '</tr>'; });
    h += '<tr><th>Daily beverages</th>' + W.days.map(function () { return '<td><span class="num">' + money(W.daily.costPerResident) + '</span></td>'; }).join("") + '</tr>';
    h += '<tr class="total"><th>Per resident</th>' + W.days.map(function (d, di) { return '<td><span class="num">' + money(dayCost(state, di, 1)) + '</span></td>'; }).join("") + '</tr>';
    h += '<tr class="total"><th>For ' + n + ' residents</th>' + W.days.map(function (d, di) { return '<td><span class="num">' + money(dayCost(state, di, n)) + '</span></td>'; }).join("") + '</tr></tbody></table></div>';
    h += '<p class="note">Daily beverages: ' + esc(W.daily.label) + '. ' + esc(W.daily.costNote) + '.</p>';
    h += '<h2>Shopping list by store, ' + n + ' residents</h2><p class="note">' + esc(W.flyerWindow) + ' Costs cover the amount used, not whole packages, so expect the register total to run higher in the first week and lower after as staples carry over.</p>';
    byStore(shopping(state, n)).forEach(function (g) {
      h += '<div class="store"><h3>' + esc(g.store) + '<span class="num">' + money(g.total) + '</span></h3><div class="scroll"><table><thead><tr><th>Item</th><th class="r">Need</th><th class="r">Unit price</th><th class="r">Cost</th></tr></thead><tbody>' + g.items.map(function (x) {
        var s = x.i.src && W.sources[x.i.src];
        return '<tr><td>' + esc(x.i.name) + ' ' + (x.i.kind === "sale" ? (s ? '<a class="tag sale" href="' + s.url + '" target="_blank" rel="noopener">flyer</a>' : '<span class="tag sale">flyer</span>') : '<span class="tag est">est.</span>') + (x.i.note ? '<span class="cell-sub">' + esc(x.i.note) + '</span>' : '') + '</td><td class="r num">' + qty(x.q) + ' ' + unitLabel(x.i.unit, x.q) + '</td><td class="r num">' + money(x.i.price) + '/' + x.i.unit + '</td><td class="r num">' + money(x.cost) + '</td></tr>';
      }).join("") + '</tbody></table></div></div>';
    });
    h += '<h2>Ingredients for 2, 4, 6, 8 and 10 residents</h2><div class="scroll"><table><thead><tr><th>Ingredient</th><th>Unit</th>' + SIZES.map(function (s) { return '<th class="r">' + s + '</th>'; }).join("") + '</tr></thead><tbody>';
    shopping(state, 10).sort(function (a, b) { return a.i.name < b.i.name ? -1 : 1; }).forEach(function (x) { h += '<tr><td>' + esc(x.i.name) + '</td><td>' + x.i.unit + '</td>' + SIZES.map(function (s) { return '<td class="r num">' + qty(x.q * s / 10) + '</td>'; }).join("") + '</tr>'; });
    h += '<tr class="total"><th colspan="2">Week total</th>' + SIZES.map(function (s) { return '<td class="r num">' + money(weekCost(state, s)) + '</td>'; }).join("") + '</tr><tr class="total"><th colspan="2">Per resident, per day</th>' + SIZES.map(function (s) { return '<td class="r num">' + money(weekCost(state, s) / s / 7) + '</td>'; }).join("") + '</tr></tbody></table></div>';
    $("costs").innerHTML = h;
  }
  function renderRecipes() {
    var n = state.n, h = '<p class="note">Recipes for the meals picked on the Plan tab, scaled for ' + n + ' residents. Every recipe is adapted from a source rated 4.5 stars or higher; the rating and count shown are what the source page displayed on ' + W.refreshed + '.</p>';
    usedRecipes(state).forEach(function (rid) {
      var r = R[rid]; if (r.steps.length < 2) return;
      var vid = r.src && r.src[4] ? '<a class="btn-link" href="' + r.src[1] + '" target="_blank" rel="noopener">▶ Watch the video on ' + esc(r.src[0]) + '</a>' : '<a class="btn-link ghost" href="https://www.youtube.com/results?search_query=' + encodeURIComponent(r.short + " recipe") + '" target="_blank" rel="noopener">Find a video on YouTube</a>';
      h += '<article class="recipe"><header><div><span class="eyebrow">' + r.type + '</span><h3>' + esc(r.name) + '</h3></div><div class="r-meta">' + stars(r.src) + '<span class="num">' + money(perResident(rid)) + ' per resident</span></div></header><div class="r-body"><div><h4>Ingredients for ' + n + '</h4><ul>' +
        r.items.filter(function (it) { return it[0] !== "pantry"; }).map(function (it) { var i = ing(it[0]), q = it[1] * n / 10; return '<li><b>' + qty(q) + ' ' + unitLabel(i.unit, q) + '</b> ' + esc(i.name.replace(/\s*\(.*\)$/, "")) + '</li>'; }).join("") + '</ul></div><div><h4>Method</h4><ol>' + r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ol>' +
        (r.temp ? '<p class="temp"><b>Safe temperature</b> ' + esc(r.temp) + '</p>' : '') + '<p class="r-links">' + vid + (r.src ? '<a class="btn-link ghost" href="' + r.src[1] + '" target="_blank" rel="noopener">Original recipe and reviews</a>' : '') + (r.src2 ? '<a class="btn-link ghost" href="' + r.src2[1] + '" target="_blank" rel="noopener">' + esc(r.src2[0]) + ' ★ ' + r.src2[2] + '</a>' : '') + '</p></div></div></article>';
    });
    $("recipes").innerHTML = h;
  }
  function renderDeals() {
    var H = W.holiday, h = "";
    if (H) h += '<div class="holiday"><h2>' + esc(H.title) + '</h2><p>' + esc(H.text) + '</p><div class="scroll"><table><thead><tr><th>Store</th><th>Item</th><th class="r">Price</th></tr></thead><tbody>' + H.deals.map(function (d) { var s = W.sources[d[3]]; return '<tr><td>' + esc(d[0]) + '</td><td>' + (s ? '<a href="' + s.url + '" target="_blank" rel="noopener">' + esc(d[1]) + '</a>' : esc(d[1])) + '</td><td class="r num">' + esc(d[2]) + '</td></tr>'; }).join("") + '</tbody></table></div></div>';
    h += '<h2>Flyer prices matched to this menu</h2><p class="note">' + esc(W.flyerWindow) + '</p>';
    var g = {}; Object.keys(W.ingredients).forEach(function (id) { var i = ing(id); if (i.kind === "sale") (g[i.store] = g[i.store] || []).push(i); });
    var usedIn = function (id) { return Object.keys(R).filter(function (rid) { return R[rid].type !== "snack" && R[rid].items.some(function (it) { return it[0] === id; }); }).map(function (rid) { return R[rid].short; }); };
    Object.keys(g).forEach(function (store) {
      h += '<div class="store"><h3>' + esc(store) + '</h3><div class="scroll"><table><thead><tr><th>Item</th><th class="r">Price</th><th>Used in</th></tr></thead><tbody>' + g[store].map(function (i) { var u = usedIn(i.id); return '<tr><td>' + esc(i.name) + (i.note ? '<span class="cell-sub">' + esc(i.note) + '</span>' : '') + '</td><td class="r num">' + money(i.price) + '/' + i.unit + '</td><td class="cell-sub2">' + esc(u.slice(0, 4).join(", ") + (u.length > 4 ? " +" + (u.length - 4) + " more" : "")) + '</td></tr>'; }).join("") + '</tbody></table></div></div>';
    });
    h += '<h2>What was checked at each store</h2><div class="scroll"><table><tbody>' + W.storeNotes.map(function (s) { return '<tr><th>' + esc(s[0]) + '</th><td><span class="pill ' + (s[1] === "ok" ? "good" : s[1] === "partial" ? "warn" : "bad") + '">' + (s[1] === "ok" ? "Read in full" : s[1] === "partial" ? "Partly read" : "Not available") + '</span></td><td>' + esc(s[2]) + '</td></tr>'; }).join("") + '</tbody></table></div>';
    h += '<h2>Sources</h2><ul class="src">' + Object.keys(W.sources).map(function (k) { var s = W.sources[k]; return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.label) + '</a></li>'; }).join("") + '</ul>';
    $("deals").innerHTML = h;
  }
  function renderRules() {
    var T = W.targets, h = '<h2>Daily food group check</h2><p class="note">Targets come from the 2015–2020 Dietary Guidelines 1,800-calorie pattern, the guideline A.A.C. R9-10-817(A)(5) names for planning meals and snacks. Figures are planning estimates per resident and include the daily milk and juice. They are not a dietitian\'s analysis and do not replace a resident\'s service plan or an ordered therapeutic diet.</p><div class="scroll"><table><thead><tr><th>Day</th>' + GROUPS.map(function (g) { return '<th class="r">' + g[1] + '<span class="cell-sub">target ' + T[g[0]] + ' ' + g[2] + '</span></th>'; }).join("") + '<th class="r">Calories<span class="cell-sub">' + T.kcalMin + '–' + T.kcalMax + '</span></th><th class="r">Protein<span class="cell-sub">grams</span></th><th class="r">Sodium<span class="cell-sub">under ' + T.sodiumMax + ' mg</span></th></tr></thead><tbody>';
    W.days.forEach(function (d, di) {
      var c = dayChecks(state, di);
      h += '<tr><th>' + d.day + '</th>' + c.slice(0, 5).map(function (x) { return '<td class="r"><span class="chk ' + x.status + '">' + x.value.toFixed(1) + '</span></td>'; }).join("") + '<td class="r"><span class="chk ' + c[5].status + '">' + Math.round(c[5].value) + '</span></td><td class="r num">' + Math.round(c.protein) + '</td><td class="r"><span class="chk ' + c[6].status + '">' + Math.round(c[6].value) + '</span></td></tr>';
    });
    h += '</tbody></table></div><p class="legend"><span class="chk ok">met (within 10%)</span><span class="chk close">10–25% under target, or sodium up to 15% over</span><span class="chk low">short, or sodium well over</span></p>';
    h += '<h2>R9-10-817 food service checklist</h2><ul class="rules">' + [
      ["Menu prepared at least one week in advance", "This menu covers " + W.weekLabel + ". The planner drafts each new week the Saturday of the week before; finalize your picks that weekend.", "A(1)(a)"],
      ["Menu lists the foods served each day", "The printed 7-Day Menu names every meal and snack.", "A(1)(b)"],
      ["Posted at least one calendar day before the first meal", "Print and post by " + fmtDate(addDays(W.weekStart, -1)) + ".", "A(1)(c)"],
      ["Substitutions written on the menu by the morning of service", "Write any substitution on the posted menu by the morning of service; the form header notes that substitutions are allowed.", "A(1)(d)"],
      ["Menus kept 60 calendar days after the last day on the menu", "Keep this one on file through " + fmtDate(addDays(W.weekStart, 66)) + ".", "A(1)(e)"],
      ["Meals and snacks served as posted", "Three meals and three snacks are scheduled every day.", "A(2)"],
      ["Meals and snacks planned with the 2015 Dietary Guidelines", "See the daily food group check above.", "A(5)"],
      ["Each resident's diet meets the needs in the service plan", "This plan is a regular diet. Adjust portions and texture per service plan; therapeutic diets need a written order.", "A(6), B"],
      ["Water available and accessible at all times", "Hydration is offered with every snack; the menu footer carries the 6–8 glasses reminder.", "A(7)"],
      ["Food prepared in a form each resident can eat", "Recipe notes flag items to cut, halve or take off the bone.", "C(3)(b)"],
      ["Cooking and holding temperatures", "Every recipe lists its temperature: poultry 165°F, ground beef and pork 155°F, fish and other foods 145°F, leftovers reheated to 165°F, cold foods 41°F or below.", "C(4)"]
    ].map(function (r) { return '<li><span class="cite">' + r[2] + '</span><div><b>' + r[0] + '</b><span>' + r[1] + '</span></div></li>'; }).join("") + '</ul><p class="note">Rule text: <a href="https://www.law.cornell.edu/regulations/arizona/Ariz-Admin-Code-SS-R9-10-817" target="_blank" rel="noopener">Ariz. Admin. Code § R9-10-817, Food Services</a>. Confirm against the current ADHS rule before a survey.</p>';
    $("rules").innerHTML = h;
  }
  var downloads = null, DOCS = { menu: ["7-Day Menu", menuDoc], report: ["Weekly Menu Cost Report", reportDoc], recipes: ["Weekly Recipes", recipesDoc] };
  function renderPrint() {
    $("print").innerHTML = homesBlock() + '<h2>Print</h2><p class="note">' + (root.MENU_STANDALONE ? 'Each button builds a ready-to-print page from your current picks and resident count and opens the print dialog.' : 'Each button builds a ready-to-print page from your current picks and resident count. Save it, open the saved file (it opens in Safari or Chrome), then press ⌘P.') + '</p><div class="print-grid">' +
      [["menu", "7-Day Menu", "Your 7-Day Menu form in its brown and gold layout, landscape, one page. Post it and keep it 60 days."], ["report", "Cost report", "Week total, cost per resident for every meal and snack, shopping list by store, amounts for 2 to 10 residents, food group check."], ["recipes", "Recipes", "Every recipe on this week's plan, scaled to the resident count, with safe temperatures."]].map(function (d) {
        return '<div class="print-card"><h3>' + d[1] + '</h3><p>' + d[2] + '</p><div class="print-btns"><button type="button" class="primary" data-doc="' + d[0] + '" data-act="save">' + (root.MENU_STANDALONE ? "Print" : "Save printable file") + '</button><button type="button" data-doc="' + d[0] + '" data-act="preview">Preview here</button></div></div>';
      }).join("") + '</div><p id="print-msg" class="note" role="status"></p><div id="preview-wrap" hidden><div class="preview-bar"><b id="preview-title"></b><button type="button" id="preview-close">Close preview</button></div><iframe id="preview" title="Print preview" sandbox=""></iframe></div>';
  }
  function renderAll() { renderSummary(); renderPlan(); renderCosts(); renderRecipes(); renderRules(); }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.classList.contains("opt")) { state.sel[+b.dataset.di][b.dataset.slot] = b.dataset.rid; save(); renderAll(); return; }
    if (b.dataset.n) { state.n = +b.dataset.n; save(); renderAll(); return; }
    if (b.dataset.tab) { showTab(b.dataset.tab); try { location.hash = b.dataset.tab; } catch (x) {} return; }
    if (b.id === "reset") { state = defaultState(); save(); renderAll(); return; }
    if (b.id === "preview-close") { $("preview-wrap").hidden = true; return; }
    if (b.id === "home-save" || b.id === "home-add") {
      var f = homeFields();
      if (!f.name) { $("home-msg").textContent = "Enter the home's name first."; return; }
      if (b.id === "home-add") { if (homes.list.some(function (x) { return x.name.toLowerCase() === f.name.toLowerCase(); })) { $("home-msg").textContent = "A home with that name is already in the list. Change the name, or use Save changes."; return; } homes.list.push(f); homes.cur = homes.list.length - 1; } else homes.list[homes.cur] = f;
      homeMsg = (saveHomes() ? f.name + " saved." : f.name + " is set for this session, but this browser would not save it for next time.") + " Printed documents now use it."; applyHome(); renderPrint(); return;
    }
    if (b.id === "home-del") { var gone = homes.list.splice(homes.cur, 1)[0]; homes.cur = 0; saveHomes(); applyHome(); homeMsg = gone.name + " removed. Printing for " + homes.list[0].name + "."; renderPrint(); return; }
    if (b.dataset.doc) {
      var d = DOCS[b.dataset.doc], html = d[1](state), msg = $("print-msg");
      if (b.dataset.act === "preview") { $("preview-title").textContent = d[0]; $("preview").srcdoc = html; $("preview-wrap").hidden = false; $("preview-wrap").scrollIntoView({ behavior: "smooth" }); return; }
      if (root.MENU_STANDALONE) { try { var url = URL.createObjectURL(new Blob([html.replace("</body>", "<script>setTimeout(function(){window.print()},400)<\/script></body>")], { type: "text/html" })); var w = window.open(url, "_blank"); msg.textContent = w ? d[0] + " opened in a new tab with the print dialog." : "Your browser blocked the new tab. Allow pop-ups for this page, or use Preview."; } catch (x) { msg.textContent = "Could not open the printable page. Use Preview."; } return; }
      var getD = downloads ? Promise.resolve(downloads) : (root.claude && root.claude.use ? root.claude.use("downloads") : Promise.resolve(null));
      msg.textContent = "Preparing " + d[0] + "…";
      getD.then(function (dl) { downloads = dl; if (!dl) { msg.textContent = "Saving files is not available in this view. Open the planner on its own page in Claude, use Preview, or use the PDFs sent in the chat."; return; }
      return dl.save({ filename: homes.list[homes.cur].name.replace(/[^A-Za-z0-9 ]+/g, "").trim() + " " + d[0] + " " + W.weekStart + ".html", data: html }).then(function () { msg.textContent = d[0] + " saved. Open the file from Downloads and press ⌘P to print."; }, function (err) { msg.textContent = err && err.code === "declined" ? "Save cancelled." : "The file could not be saved here (" + ((err && err.code) || "unavailable") + "). Use Preview, or the PDFs sent in the chat."; }); }, function () { msg.textContent = "Saving files is not available in this view."; });
    }
  });
  document.addEventListener("change", function (e) { var s = e.target; if (s.id === "home-sel") { homes.cur = +s.value; saveHomes(); applyHome(); homeMsg = "Printing for " + homes.list[homes.cur].name + "."; renderPrint(); return; } if (s.tagName === "SELECT" && s.dataset.k) { state.sel[+s.dataset.di].snacks[+s.dataset.k] = s.value; save(); renderAll(); } });
  var TABS = ["plan", "costs", "recipes", "deals", "rules", "print"];
  function showTab(t) { if (TABS.indexOf(t) < 0) t = "plan"; TABS.forEach(function (x) { $(x).hidden = x !== t; }); Array.prototype.forEach.call(document.querySelectorAll("nav button"), function (b) { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", b.dataset.tab === t); }); }
  window.addEventListener("hashchange", function () { showTab(location.hash.slice(1)); });

  $("week").textContent = "Week of " + W.weekLabel;
  $("fresh").textContent = "Flyer prices checked " + W.refreshed + (root.MENU_SOURCE ? " · " + root.MENU_SOURCE : "");
  if (W.holiday) { $("alert").hidden = false; $("alert").innerHTML = '<b>' + esc(W.holiday.title) + '.</b> ' + esc(W.holiday.text) + ' <button type="button" data-tab="deals">See turkey prices</button>'; }
  renderAll(); renderDeals(); renderPrint(); showTab(location.hash.slice(1) || "plan");
})(typeof window !== "undefined" ? window : global);
