export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>gh-traffic-tracker</title>
<style>
  :root {
    --bg: #0a0a0a;
    --surface-1: #17130f;
    --surface-2: #0d0d0d;
    --text-primary: #f5f2ea;
    --text-secondary: #c3bcab;
    --text-muted: #8c8471;
    --border: rgba(255,255,255,0.11);
    --gridline: #2a2620;
    --accent: #35c235;
    /* Two chart series colors, chosen for both hue AND lightness separation
       (blue: lighter/cool, amber: darker/warm) rather than hue alone \\u2014
       the color-vision-safe validator script wasn't available in this
       environment to confirm the usual way, so this is a manual, more
       conservative substitute, not a substitute for actually running it. */
    --series-total: #5b9bd5;
    --series-unique: #c9702f;
    --mono: ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text-primary); }
  body { font-family: var(--mono); line-height: 1.5; }

  .page { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
  .subtitle { color: var(--text-muted); font-size: 13px; margin: 0 0 24px; }

  #gate {
    max-width: 360px; margin: 80px auto; background: var(--surface-1);
    border: 1px solid var(--border); border-radius: 8px; padding: 24px;
  }
  #gate p { color: var(--text-secondary); font-size: 13px; margin: 0 0 16px; }
  #gate input {
    width: 100%; padding: 8px 10px; font-size: 14px; border: 1px solid var(--border);
    border-radius: 6px; background: var(--surface-2); color: var(--text-primary); margin-bottom: 12px;
    font-family: var(--mono);
  }
  #gate button {
    width: 100%; padding: 8px 10px; font-size: 14px; font-weight: 600; border: none;
    border-radius: 6px; background: var(--accent); color: #06230a; cursor: pointer;
    font-family: var(--mono);
  }
  #gate .error { color: #e66767; font-size: 12px; margin: -4px 0 12px; }

  #app { display: none; }

  .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .toolbar select {
    background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border);
    border-radius: 6px; padding: 7px 10px; font-family: var(--mono); font-size: 13px;
  }
  .toolbar button {
    background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border);
    border-radius: 6px; padding: 7px 12px; font-family: var(--mono); font-size: 13px; cursor: pointer;
  }
  .toolbar button:hover { border-color: var(--text-secondary); }
  .toolbar .status { color: var(--text-muted); font-size: 12px; }

  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .tile .label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .tile .value { font-size: 26px; font-weight: 700; }
  .tile .value.total { color: var(--series-total); }
  .tile .value.unique { color: var(--series-unique); }

  .chart-card {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px 18px; margin-bottom: 20px;
  }
  .chart-card h2 { font-size: 13px; font-weight: 700; margin: 0 0 12px; color: var(--text-secondary); }
  .legend { display: flex; gap: 16px; margin-bottom: 10px; font-size: 12px; color: var(--text-secondary); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend .swatch { width: 14px; height: 2px; display: inline-block; }
  .legend .swatch.total { background: var(--series-total); }
  .legend .swatch.unique { background: var(--series-unique); border-top: 2px dashed var(--series-unique); background: none; height: 0; }

  .chart-wrap { position: relative; overflow-x: auto; }
  svg.chart { display: block; width: 100%; height: auto; }
  .chart-tooltip {
    position: absolute; pointer-events: none; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 10px; font-size: 11px; color: var(--text-primary); white-space: nowrap;
    transform: translate(-50%, -110%); display: none; z-index: 10;
  }
  .chart-tooltip .row { display: flex; justify-content: space-between; gap: 12px; }
  .chart-tooltip .row.total { color: var(--series-total); }
  .chart-tooltip .row.unique { color: var(--series-unique); }

  .table-wrap { width: 100%; overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; background: var(--surface-1); font-size: 12.5px; }
  thead th {
    text-align: left; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.04em; padding: 8px 12px; border-bottom: 1px solid var(--gridline);
  }
  tbody td { padding: 8px 12px; border-bottom: 1px solid var(--gridline); }
  tbody tr:last-child td { border-bottom: none; }
  .muted { color: var(--text-muted); }

  tbody tr.repo-row { cursor: pointer; }
  tbody tr.repo-row:hover { background: var(--surface-2); }
  tbody tr.repo-row.active { background: rgba(53,194,53,0.08); }
  tbody tr.repo-row.disabled { opacity: 0.5; }
  .status-pill {
    display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .status-pill.on { background: rgba(53,194,53,0.16); color: var(--accent); }
  .status-pill.off { background: rgba(255,255,255,0.08); color: var(--text-muted); }

  .tables-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  @media (max-width: 700px) { .tables-row { grid-template-columns: 1fr; } }

  h2.section { font-size: 13px; font-weight: 700; color: var(--text-secondary); margin: 0 0 10px; }
</style>
</head>
<body>
<div class="page">

  <div id="gate">
    <h1>gh-traffic-tracker</h1>
    <p>Enter the API secret to view clone/view stats.</p>
    <div id="gate-error" class="error" style="display:none">Invalid secret.</div>
    <input id="secret-input" type="password" placeholder="API secret" autocomplete="off">
    <button id="gate-submit">Unlock</button>
  </div>

  <div id="app">
    <h1>gh-traffic-tracker</h1>
    <p class="subtitle">Clone and view history GitHub itself only keeps for 14 days \\u2014 stored permanently here.</p>

    <div class="toolbar">
      <select id="repo-select"></select>
      <button id="refresh-btn" type="button">Refresh</button>
      <button id="trigger-btn" type="button">Poll now</button>
      <span class="status" id="toolbar-status"></span>
    </div>

    <div id="loading">Loading\\u2026</div>
    <div id="error-banner" style="display:none; color:#e66767;"></div>

    <h2 class="section" style="margin-top:8px;">All tracked repos</h2>
    <p class="subtitle" style="margin-top:-4px;">All-time totals, every repo side by side. Click a row to see its detail below.</p>
    <div class="table-wrap" style="margin-bottom:28px;">
      <table>
        <thead><tr><th>Repo</th><th>Status</th><th>Clones</th><th>Unique cloners</th><th>Views</th><th>Unique visitors</th><th>Latest data</th></tr></thead>
        <tbody id="repos-summary-rows"></tbody>
      </table>
    </div>

    <div id="content" style="display:none">
      <div class="tiles" id="tiles"></div>

      <div class="chart-card">
        <h2>Clones per day</h2>
        <div class="legend">
          <span><span class="swatch total"></span>Total</span>
          <span><span class="swatch unique"></span>Unique</span>
        </div>
        <div class="chart-wrap" id="clones-chart-wrap"></div>
      </div>

      <div class="chart-card">
        <h2>Views per day</h2>
        <div class="legend">
          <span><span class="swatch total"></span>Total</span>
          <span><span class="swatch unique"></span>Unique</span>
        </div>
        <div class="chart-wrap" id="views-chart-wrap"></div>
      </div>

      <div class="tables-row">
        <div>
          <h2 class="section">Top referrers (last snapshot)</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Referrer</th><th>Count</th><th>Unique</th></tr></thead>
              <tbody id="referrers-rows"></tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 class="section">Top paths (last snapshot)</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Path</th><th>Count</th><th>Unique</th></tr></thead>
              <tbody id="paths-rows"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

</div>

<script>
(function () {
  var STORAGE_KEY = "gh_tracker_secret";
  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var gateError = document.getElementById("gate-error");
  var secretInput = document.getElementById("secret-input");

  function getSecret() { return sessionStorage.getItem(STORAGE_KEY); }
  function setSecret(v) { sessionStorage.setItem(STORAGE_KEY, v); }
  function clearSecret() { sessionStorage.removeItem(STORAGE_KEY); }
  function authHeaders() { return { Authorization: "Bearer " + getSecret() }; }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // --- Minimal hand-rolled SVG line chart: two series (total/unique),
  // recessive gridlines, hover crosshair + tooltip. No charting library,
  // consistent with the rest of this project being dependency-free.
  function renderLineChart(wrapId, rows, colorTotal, colorUnique) {
    var wrap = document.getElementById(wrapId);
    wrap.innerHTML = "";

    if (!rows.length) {
      wrap.innerHTML = '<p class="muted" style="font-size:12px;">No data yet.</p>';
      return;
    }

    var W = 900, H = 220, padL = 36, padR = 12, padT = 12, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var maxVal = 1;
    rows.forEach(function (r) { maxVal = Math.max(maxVal, r.count, r.uniques); });
    maxVal = Math.ceil(maxVal * 1.15) || 1;

    function x(i) { return rows.length === 1 ? padL + plotW / 2 : padL + (i / (rows.length - 1)) * plotW; }
    function y(v) { return padT + plotH - (v / maxVal) * plotH; }

    function path(key) {
      return rows.map(function (r, i) { return (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(r[key]).toFixed(1); }).join(" ");
    }

    // 4 horizontal gridlines + labels
    var gridLines = "";
    var gridLabels = "";
    for (var g = 0; g <= 4; g++) {
      var gv = Math.round((maxVal / 4) * g);
      var gy = y(gv);
      gridLines += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="var(--gridline)" stroke-width="1"/>';
      gridLabels += '<text x="' + (padL - 8) + '" y="' + (gy + 3) + '" font-size="9" fill="var(--text-muted)" text-anchor="end">' + gv + '</text>';
    }

    // A handful of x-axis date labels (first, ~middle, last) rather than one per point.
    var xLabelIdx = rows.length <= 2 ? [0] : [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
    var xLabels = xLabelIdx.map(function (i) {
      return '<text x="' + x(i) + '" y="' + (H - 6) + '" font-size="9" fill="var(--text-muted)" text-anchor="middle">' + escapeHtml(rows[i].date.slice(5)) + '</text>';
    }).join("");

    var markers = rows.length <= 31
      ? rows.map(function (r, i) {
          return '<circle cx="' + x(i) + '" cy="' + y(r.count) + '" r="2.5" fill="' + colorTotal + '"/>' +
                 '<circle cx="' + x(i) + '" cy="' + y(r.uniques) + '" r="2.5" fill="' + colorUnique + '"/>';
        }).join("")
      : "";

    wrap.innerHTML =
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily totals and uniques over time">' +
        gridLines + gridLabels + xLabels +
        '<path d="' + path("count") + '" fill="none" stroke="' + colorTotal + '" stroke-width="2"/>' +
        '<path d="' + path("uniques") + '" fill="none" stroke="' + colorUnique + '" stroke-width="2" stroke-dasharray="5,3"/>' +
        markers +
        '<rect id="' + wrapId + '-hitrect" x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="transparent"/>' +
      '</svg>' +
      '<div class="chart-tooltip" id="' + wrapId + '-tooltip"></div>';

    var svg = wrap.querySelector("svg");
    var tooltip = document.getElementById(wrapId + "-tooltip");

    svg.addEventListener("mousemove", function (e) {
      var rect = svg.getBoundingClientRect();
      var svgX = ((e.clientX - rect.left) / rect.width) * W;
      var idx = rows.length === 1 ? 0 : Math.round(((svgX - padL) / plotW) * (rows.length - 1));
      idx = Math.max(0, Math.min(rows.length - 1, idx));
      var r = rows[idx];

      tooltip.style.display = "block";
      tooltip.style.left = ((e.clientX - rect.left) / rect.width) * 100 + "%";
      tooltip.style.top = ((y(Math.max(r.count, r.uniques)) / H) * 100) + "%";
      tooltip.innerHTML =
        '<div style="color:var(--text-secondary);margin-bottom:2px;">' + escapeHtml(r.date) + '</div>' +
        '<div class="row total"><span>Total</span><span>' + r.count + '</span></div>' +
        '<div class="row unique"><span>Unique</span><span>' + r.uniques + '</span></div>';
    });
    svg.addEventListener("mouseleave", function () { tooltip.style.display = "none"; });
  }

  function renderTiles(totals) {
    var el = document.getElementById("tiles");
    el.innerHTML =
      '<div class="tile"><div class="label">Total Clones (all-time)</div><div class="value total">' + totals.clone_count_sum + '</div></div>' +
      '<div class="tile"><div class="label">Unique Cloners (summed/day)</div><div class="value unique">' + totals.clone_uniques_sum + '</div></div>' +
      '<div class="tile"><div class="label">Total Views (all-time)</div><div class="value total">' + totals.view_count_sum + '</div></div>' +
      '<div class="tile"><div class="label">Unique Visitors (summed/day)</div><div class="value unique">' + totals.view_uniques_sum + '</div></div>';
  }

  function renderReferrers(rows) {
    var el = document.getElementById("referrers-rows");
    if (!rows.length) { el.innerHTML = '<tr><td colspan="3" class="muted">No referrer data in the last snapshot.</td></tr>'; return; }
    el.innerHTML = rows.map(function (r) {
      return '<tr><td>' + escapeHtml(r.referrer) + '</td><td>' + r.count + '</td><td>' + r.uniques + '</td></tr>';
    }).join("");
  }

  function renderPaths(rows) {
    var el = document.getElementById("paths-rows");
    if (!rows.length) { el.innerHTML = '<tr><td colspan="3" class="muted">No path data in the last snapshot.</td></tr>'; return; }
    el.innerHTML = rows.map(function (r) {
      return '<tr><td>' + escapeHtml(r.path) + '</td><td>' + r.count + '</td><td>' + r.uniques + '</td></tr>';
    }).join("");
  }

  var currentRepo = null;
  var lastReposSummary = [];

  function renderReposSummary(rows) {
    lastReposSummary = rows;
    var el = document.getElementById("repos-summary-rows");
    if (!rows.length) {
      el.innerHTML = '<tr><td colspan="7" class="muted">No tracked repos yet \\u2014 click "Poll now" to discover them.</td></tr>';
      return;
    }
    el.innerHTML = rows.map(function (r, i) {
      var isActive = r.repo === currentRepo;
      return '<tr class="repo-row' + (isActive ? ' active' : '') + (r.enabled ? '' : ' disabled') + '" data-idx="' + i + '">' +
        '<td>' + escapeHtml(r.repo) + '</td>' +
        '<td><span class="status-pill ' + (r.enabled ? 'on' : 'off') + '">' + (r.enabled ? 'Tracking' : 'Disabled') + '</span></td>' +
        '<td>' + r.clone_count_sum + '</td>' +
        '<td>' + r.clone_uniques_sum + '</td>' +
        '<td>' + r.view_count_sum + '</td>' +
        '<td>' + r.view_uniques_sum + '</td>' +
        '<td class="muted">' + escapeHtml(r.latest_date || "\\u2014") + '</td>' +
        '</tr>';
    }).join("");
  }

  function loadReposSummary() {
    return fetch("/api/repos-summary", { headers: authHeaders() })
      .then(function (res) { return res.ok ? res.json() : { repos: [] }; })
      .then(function (data) { renderReposSummary(data.repos || []); })
      .catch(function () { /* comparison table is a bonus view, never block the rest of the page on it */ });
  }

  document.getElementById("repos-summary-rows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr.repo-row");
    if (!tr) return;
    var idx = Number(tr.getAttribute("data-idx"));
    var r = lastReposSummary[idx];
    if (!r) return;
    currentRepo = r.repo;
    loadStats();
    renderReposSummary(lastReposSummary);
  });

  function loadStats() {
    document.getElementById("loading").style.display = "block";
    document.getElementById("error-banner").style.display = "none";
    var qs = currentRepo ? "?repo=" + encodeURIComponent(currentRepo) : "";
    fetch("/api/stats" + qs, { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) { clearSecret(); showGate("Invalid secret."); return null; }
        if (!res.ok) throw new Error("request failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        document.getElementById("loading").style.display = "none";
        document.getElementById("content").style.display = "block";
        currentRepo = data.repo;

        var select = document.getElementById("repo-select");
        select.innerHTML = data.repos.map(function (r) {
          return '<option value="' + escapeHtml(r) + '"' + (r === data.repo ? " selected" : "") + '>' + escapeHtml(r) + '</option>';
        }).join("");

        renderTiles(data.totals);
        var colorTotal = getComputedColor("--series-total");
        var colorUnique = getComputedColor("--series-unique");
        renderLineChart("clones-chart-wrap", data.clones, colorTotal, colorUnique);
        renderLineChart("views-chart-wrap", data.views, colorTotal, colorUnique);
        renderReferrers(data.referrers);
        renderPaths(data.paths);
      })
      .catch(function (err) {
        document.getElementById("loading").style.display = "none";
        var banner = document.getElementById("error-banner");
        banner.style.display = "block";
        banner.textContent = "Failed to load stats: " + err.message;
      });
  }

  function getComputedColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  document.getElementById("repo-select").addEventListener("change", function (e) {
    currentRepo = e.target.value;
    loadStats();
  });

  document.getElementById("refresh-btn").addEventListener("click", function () {
    loadStats();
    loadReposSummary();
  });

  document.getElementById("trigger-btn").addEventListener("click", function () {
    var btn = document.getElementById("trigger-btn");
    var status = document.getElementById("toolbar-status");
    btn.disabled = true;
    status.textContent = "Polling\\u2026";
    fetch("/trigger", { method: "POST", headers: authHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        // Shows the real summary (including the discovery result) rather
        // than just "done" \\u2014 this is what used to be silently swallowed.
        status.textContent = data.ok ? data.summary : "Poll failed: " + data.error;
        btn.disabled = false;
        loadStats();
        loadReposSummary();
      })
      .catch(function (err) {
        status.textContent = "Poll failed: " + err.message;
        btn.disabled = false;
      });
  });

  function showGate(errorMsg) {
    app.style.display = "none";
    gate.style.display = "block";
    if (errorMsg) {
      gateError.textContent = errorMsg;
      gateError.style.display = "block";
    } else {
      gateError.style.display = "none";
    }
  }

  function showApp() {
    gate.style.display = "none";
    app.style.display = "block";
    loadStats();
    loadReposSummary();
  }

  document.getElementById("gate-submit").addEventListener("click", function () {
    var v = secretInput.value.trim();
    if (!v) return;
    setSecret(v);
    showApp();
  });
  secretInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("gate-submit").click();
  });

  if (getSecret()) {
    showApp();
  } else {
    showGate();
  }
})();
</script>
</body>
</html>
`;
