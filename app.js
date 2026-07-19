"use strict";
// Public strategy codes: 6f / 7fh / momAB / MAG7 (+ benchmarks).
// Strategies are drawn in strong colours; benchmarks and the regime-dependent
// MAG7 reference are drawn in muted grey (data flag `gray`).
const COLORS = {
  "6f": "#1f4e79", "7fh": "#b3242b", "momAB": "#6a3d9a",
  // muted-but-tinted reference lines: bronze / slate-blue / sage-green
  "MAG7": "#a08c6a", "QQQ": "#7b87a8", "S&P 500": "#7d9b7a",
};
// muted lines stay distinguishable: each gets its own dash pattern
const DASHES = {"QQQ": "7 4", "S&P 500": "2 4", "MAG7": "9 4 2 4"};
const isGray = l => !!(l && l.gray);
const isBench = l => (l && l.kind) === "benchmark";
const fmtX = v => v == null ? "" : (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + "x";
const fmtPct = v => v == null ? "" : (v * 100).toFixed(1) + "%";
const fmtSignedPct = v => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";
const fmtNum = v => v == null ? "" : v.toFixed(2);
const fmtUsd = v => "$" + Math.round(v).toLocaleString("en-US");
const SVGNS = "http://www.w3.org/2000/svg";
const el = (t, a) => { const e = document.createElementNS(SVGNS, t);
  for (const k in a) e.setAttribute(k, a[k]); return e; };

// ---- hidden-lines persistence (per browsing session, 30-min TTL) -----------
const HIDE_KEY = "ql_hidden_lines", HIDE_TTL = 30 * 60 * 1000;
function loadHidden() {
  try {
    const o = JSON.parse(sessionStorage.getItem(HIDE_KEY) || "null");
    if (!o || Date.now() - o.t > HIDE_TTL) return new Set();
    return new Set(o.h);
  } catch (e) { return new Set(); }
}
function saveHidden(set) {
  try {
    sessionStorage.setItem(HIDE_KEY, JSON.stringify({h: [...set], t: Date.now()}));
  } catch (e) { /* storage unavailable — setting just won't persist */ }
}

// ---- shared ordering: by profitability / time-domination, benchmarks last --
function orderLines(lines) {
  return lines.slice().sort((a, b) => {
    const ab = isBench(a), bb = isBench(b);
    if (ab !== bb) return ab ? 1 : -1;                 // benchmarks last
    const d = (b.dom_top1 || 0) - (a.dom_top1 || 0);   // dominance desc
    if (Math.abs(d) > 1e-9) return d;
    return (b.total_x || 0) - (a.total_x || 0);        // then total return
  });
}

// ---- self-contained responsive SVG log-line chart ---------------------------
// opts: height, boundary (unix ts of the live marker), dollar (if set, hover
// shows dollar values on a `dollar` base invested at the range start).
// Curves are REBASED to 1.0 at the first visible point of the selected range,
// so a ranged view reads "growth as if invested at the range start".
function makeChart(container, lines, opts = {}) {
  const H = opts.height || 400, W = 1000;
  const padL = 50, padR = 14, padT = 12, padB = 28;
  const state = {hidden: loadHidden(), min: null, max: null,
                 boundary: opts.boundary || null};
  let tmin = Infinity, tmax = -Infinity;
  lines.forEach(l => l.curve.forEach(p => { if (p[0] < tmin) tmin = p[0]; if (p[0] > tmax) tmax = p[0]; }));
  state.min = tmin; state.max = tmax;
  const yTicks = [0.5, 1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 500];
  // draw grey lines first so the strong strategy lines sit on top
  const drawn = orderLines(lines).slice().sort((a, b) => (isGray(a) ? 0 : 1) - (isGray(b) ? 0 : 1));
  container.style.position = "relative";

  const inRange = (p, min, max) => p[0] >= min && p[0] <= max && p[1] != null && p[1] > 0;

  function baseOf(l, min, max) {
    // full view = the actual book (curves are exact growth of the $10k
    // start); a RANGED view rebases to the first visible point, reading as
    // "$10k invested at the range start"
    if (min <= tmin) {
      for (const p of l.curve) if (inRange(p, min, max)) return 1.0;
      return null;
    }
    for (const p of l.curve) if (inRange(p, min, max)) return p[1];
    return null;
  }

  function nearestPoint(l, t, min, max) { // binary search on the time axis
    const c = l.curve;
    let lo = 0, hi = c.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (c[mid][0] < t) lo = mid + 1; else hi = mid;
    }
    let best = null, bd = Infinity;
    for (let i = Math.max(0, lo - 1); i <= Math.min(c.length - 1, lo + 1); i++) {
      const p = c[i];
      if (!inRange(p, min, max)) continue;
      const d = Math.abs(p[0] - t);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function render() {
    const {min, max} = state;
    const vis = drawn.filter(l => !state.hidden.has(l.code));
    const bases = new Map();
    vis.forEach(l => bases.set(l.code, baseOf(l, min, max)));
    let lo = Infinity, hi = -Infinity;
    vis.forEach(l => {
      const b = bases.get(l.code);
      if (!b) return;
      l.curve.forEach(p => {
        if (!inRange(p, min, max)) return;
        const v = p[1] / b;
        if (v < lo) lo = v; if (v > hi) hi = v;
      });
    });
    if (!isFinite(lo)) { lo = 1; hi = 2; }
    const lLo = Math.log(lo * 0.92), lHi = Math.log(hi * 1.08);
    const xw = W - padL - padR, yh = H - padT - padB;
    const X = t => padL + (t - min) / (max - min || 1) * xw;
    const Y = v => padT + (1 - (Math.log(v) - lLo) / (lHi - lLo || 1)) * yh;

    const svg = el("svg", {viewBox: `0 0 ${W} ${H}`, width: "100%",
      preserveAspectRatio: "none", role: "img",
      style: "display:block;cursor:crosshair"});
    yTicks.filter(v => v >= lo * 0.9 && v <= hi * 1.1).forEach(v => {
      const y = Y(v);
      svg.appendChild(el("line", {x1: padL, y1: y, x2: W - padR, y2: y,
        stroke: "#e7e3d7", "stroke-width": 1, "vector-effect": "non-scaling-stroke"}));
      const tx = el("text", {x: padL - 7, y: y + 4, "text-anchor": "end",
        fill: "#8a887e", "font-size": 13, "font-family": "Georgia,serif"});
      tx.textContent = v + "x"; svg.appendChild(tx);
    });
    const spanYears = (max - min) / 31_557_600;
    if (spanYears <= 2) {                    // short range -> month labels
      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const stepM = spanYears > 1 ? 2 : 1;
      const d0 = new Date(min * 1e3);
      let cur = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
      while (cur.getTime() / 1e3 <= max) {
        const t = cur.getTime() / 1e3;
        if (t >= min) {
          const tx = el("text", {x: X(t), y: H - 8, "text-anchor": "middle",
            fill: "#8a887e", "font-size": 13, "font-family": "Georgia,serif"});
          tx.textContent = MONTHS[cur.getMonth()] +
            (cur.getMonth() === 0 ? " " + cur.getFullYear() : "");
          svg.appendChild(tx);
        }
        cur = new Date(cur.getFullYear(), cur.getMonth() + stepM, 1);
      }
    } else {
      const y0 = new Date(min * 1e3).getFullYear(), y1 = new Date(max * 1e3).getFullYear();
      const stepY = (y1 - y0) > 12 ? 2 : 1;
      for (let yr = Math.ceil(y0 / stepY) * stepY; yr <= y1; yr += stepY) {
        const t = new Date(yr, 0, 1).getTime() / 1e3;
        if (t < min || t > max) continue;
        const tx = el("text", {x: X(t), y: H - 8, "text-anchor": "middle",
          fill: "#8a887e", "font-size": 13, "font-family": "Georgia,serif"});
        tx.textContent = yr; svg.appendChild(tx);
      }
    }
    if (state.boundary && state.boundary >= min && state.boundary <= max) {
      const x = X(state.boundary);
      svg.appendChild(el("line", {x1: x, y1: padT, x2: x, y2: H - padB,
        stroke: "#14140f", "stroke-width": 1, "stroke-dasharray": "5 4", opacity: .45,
        "vector-effect": "non-scaling-stroke"}));
      const tx = el("text", {x: x + 4, y: padT + 12, fill: "#14140f", opacity: .6,
        "font-size": 12, "font-family": "Georgia,serif"});
      tx.textContent = "live"; svg.appendChild(tx);
    }
    vis.forEach(l => {
      const b = bases.get(l.code);
      if (!b) return;
      let d = "", pen = false;
      l.curve.forEach(p => {
        if (!inRange(p, min, max)) { pen = false; return; }
        d += (pen ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1] / b).toFixed(1) + " ";
        pen = true;
      });
      svg.appendChild(el("path", {d, fill: "none", stroke: COLORS[l.code] || "#333",
        "stroke-width": isGray(l) ? 1.5 : 2.1,
        "stroke-dasharray": DASHES[l.code] || "",
        "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke"}));
    });

    // ---- hover crosshair + tooltip -----------------------------------------
    const cross = el("line", {x1: 0, y1: padT, x2: 0, y2: H - padB,
      stroke: "#8a887e", "stroke-width": 1, "stroke-dasharray": "3 3",
      opacity: 0, "vector-effect": "non-scaling-stroke"});
    svg.appendChild(cross);
    const tip = document.createElement("div");
    tip.className = "qltip";
    tip.style.display = "none";

    svg.addEventListener("mousemove", e => {
      const rect = svg.getBoundingClientRect();
      const vx = (e.clientX - rect.left) / rect.width * W;
      if (vx < padL || vx > W - padR) { cross.setAttribute("opacity", 0); tip.style.display = "none"; return; }
      const t = min + (vx - padL) / xw * (max - min);
      const rows = [];
      let snap = null;
      vis.forEach(l => {
        const b = bases.get(l.code);
        const p = b ? nearestPoint(l, t, min, max) : null;
        if (!p) return;
        if (snap == null || Math.abs(p[0] - t) < Math.abs(snap - t)) snap = p[0];
        rows.push({l, g: p[1] / b});
      });
      if (!rows.length) { cross.setAttribute("opacity", 0); tip.style.display = "none"; return; }
      rows.sort((a, b) => b.g - a.g);
      const x = X(snap);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x);
      cross.setAttribute("opacity", 1);
      const date = new Date(snap * 1e3).toISOString().slice(0, 10);
      let h = `<div class="d">${date}</div>`;
      rows.forEach(r => {
        const val = opts.dollar ? fmtUsd(opts.dollar * r.g) : r.g.toFixed(2) + "x";
        h += `<div class="r"><span class="dot" style="background:${COLORS[r.l.code]}"></span>` +
             `<span class="n">${r.l.code}</span><span class="v">${val}</span>` +
             `<span class="p ${r.g >= 1 ? "up" : "dn"}">${fmtSignedPct(r.g - 1)}</span></div>`;
      });
      tip.innerHTML = h;
      tip.style.display = "block";
      const cw = container.clientWidth, px = x / W * rect.width;
      tip.style.left = (px < cw / 2 ? px + 14 : Math.max(0, px - tip.offsetWidth - 14)) + "px";
      tip.style.top = Math.max(0, Math.min(e.clientY - rect.top + 12,
                                           container.clientHeight - tip.offsetHeight - 4)) + "px";
    });
    svg.addEventListener("mouseleave", () => {
      cross.setAttribute("opacity", 0); tip.style.display = "none";
    });

    container.innerHTML = "";
    container.appendChild(svg);
    container.appendChild(tip);
  }
  render();
  return {
    setRange: (a, b) => { state.min = a; state.max = b; render(); },
    toggle: code => {
      state.hidden.has(code) ? state.hidden.delete(code) : state.hidden.add(code);
      saveHidden(state.hidden);
      render();
    },
    isHidden: code => state.hidden.has(code),
    reset: () => { state.min = tmin; state.max = tmax; render(); },
  };
}

// Legend.  `ctl` = {isHidden(code), toggle(code)} — a page-level controller,
// so several charts/legends can stay in sync.  A plain chart object works as
// the controller too (single-chart pages).  Ordered like orderLines (pass
// window-specific lines so the order matches that chart's table).  The swatch
// is a mini-SVG drawn with the line's actual color AND dash pattern.
// Returns {refresh} — reapplies hidden state to the item classes.
function makeLegend(container, lines, ctl) {
  container.innerHTML = "";
  const items = new Map();
  orderLines(lines).forEach(l => {
    const it = document.createElement("span");
    it.className = "it" + (ctl.isHidden(l.code) ? " off" : "");
    const sw = el("svg", {width: 26, height: 8, viewBox: "0 0 26 8",
                          style: "flex:none"});
    sw.appendChild(el("line", {x1: 1, y1: 4, x2: 25, y2: 4,
      stroke: COLORS[l.code] || "#333",
      "stroke-width": isGray(l) ? 2.2 : 3,
      "stroke-dasharray": DASHES[l.code] || ""}));
    it.appendChild(sw);
    const name = document.createElement("b");
    name.textContent = l.code;
    it.appendChild(name);
    if (l.index) {
      const ix = document.createElement("span");
      ix.className = "ix";
      ix.textContent = l.index;
      it.appendChild(ix);
    }
    if (isBench(l)) {
      const b = document.createElement("span");
      b.className = "ix"; b.textContent = "benchmark";
      it.appendChild(b);
    }
    it.onclick = () => ctl.toggle(l.code);
    items.set(l.code, it);
    container.appendChild(it);
  });
  const api = {refresh: () => items.forEach(
    (it, code) => it.classList.toggle("off", ctl.isHidden(code)))};
  // single-chart pages: a raw chart as ctl → refresh ourselves on click
  if (!ctl.refreshAll) items.forEach((it, code) => {
    it.onclick = () => { ctl.toggle(code); api.refresh(); };
  });
  return api;
}

const fmtDom = v => v == null ? "" : v.toFixed(0) + "%";
const METRIC_COLS = [
  ["total_x", "Total ×", fmtX], ["CAGR", "CAGR", fmtPct],
  ["Sharpe", "Sharpe", fmtNum], ["MaxDD", "Max DD", fmtPct],
  ["Martin", "Martin", fmtNum], ["Ulcer", "Ulcer", v => v == null ? "" : v.toFixed(2)],
  ["dom_top1", "Dom top-1", fmtDom], ["dom_top2", "Dom top-2", fmtDom],
];

// Sortable metrics table.  opts: {cols (default METRIC_COLS), showStart}.
// Click a column header to sort by it (second click flips direction);
// benchmarks stay pinned below the strategies in either order.
function makeTable(container, lines, opts = {}) {
  if (opts === true || opts === false) opts = {showStart: opts};  // legacy call
  const cols = opts.cols || METRIC_COLS;
  let sortKey = null, sortDir = 1;          // 1 = descending (first click)

  function ordered() {
    let arr = orderLines(lines);
    if (sortKey) {
      const val = l => l[sortKey] == null ? -Infinity : l[sortKey];
      const cmp = (a, b) => sortDir * (val(b) - val(a));
      const strat = arr.filter(l => !isBench(l)).sort(cmp);
      const bench = arr.filter(isBench).sort(cmp);
      arr = strat.concat(bench);
    }
    return arr;
  }

  function render() {
    let h = "<table><thead><tr><th>Strategy</th><th class=\"ixh\">Index</th>";
    if (opts.showStart) h += "<th>From</th>";
    cols.forEach(c => {
      const on = c[0] === sortKey;
      h += `<th class="sortable${on ? " on" : ""}" data-k="${c[0]}">` +
           `${c[1]}${on ? (sortDir === 1 ? " ▾" : " ▴") : ""}</th>`;
    });
    h += "</tr></thead><tbody>";
    ordered().forEach(l => {
      const bench = isBench(l);
      h += `<tr class="${isGray(l) ? "bench" : ""}"><td class="code">` +
        `<span class="dot" style="background:${COLORS[l.code]}"></span>${l.code}` +
        (bench ? ' <span class="pill">benchmark</span>' : "") + "</td>";
      h += `<td class="ix">${l.index || ""}</td>`;
      if (opts.showStart) h += `<td>${(l.start || "").slice(0, 7)}</td>`;
      cols.forEach(c => h += `<td>${c[2](l[c[0]])}</td>`);
      h += "</tr>";
    });
    container.innerHTML = h + "</tbody></table>";
    container.querySelectorAll("th.sortable").forEach(th => {
      th.onclick = () => {
        const k = th.dataset.k;
        if (sortKey === k) sortDir = -sortDir;
        else { sortKey = k; sortDir = 1; }
        render();
      };
    });
  }
  render();
}
