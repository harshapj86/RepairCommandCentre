/* ==========================================================================
   app.js — bootstrap, filter bar, tab navigation, master render
   ========================================================================== */

let MODEL = null; // { records, dataQuality }
let LATEST_DATE = null;

const TABS = [
  { id: 'overview', label: '01 · Executive Overview', render: renderOverview },
  { id: 'devices', label: '02 · Device Management', render: renderDevices },
  { id: 'tat', label: '03 · Repair TAT', render: renderTat },
  { id: 'e2e', label: '04 · End-to-End TAT', render: renderE2e },
  { id: 'centres', label: '05 · Centre Performance', render: renderCentres },
  { id: 'cce', label: '06 · CCE Efficiency', render: renderCce },
  { id: 'engineers', label: '07 · Technician Efficiency', render: renderEngineers },
  { id: 'open', label: '08 · Open Repairs', render: renderOpen },
  { id: 'product', label: '09 · Product / NTF Analysis', render: renderProduct },
  { id: 'dataquality', label: '10 · Data Quality', render: null },
];
let activeTab = 'overview';

async function boot() {
  try {
    setStatus('Loading data manifest…');
    const manifestRes = await fetch('data/manifest.json', { cache: 'no-store' });
    const manifest = await manifestRes.json();

    let servifyRows = [];
    let gsxRows = [];
    const totalFiles = manifest.servify.length + manifest.gsx.length;
    let done = 0;

    for (const path of manifest.servify) {
      setStatus(`Loading Servify data… (${++done}/${totalFiles}) ${path}`);
      const rows = await Model.loadFile(path);
      servifyRows = servifyRows.concat(rows);
    }
    for (const path of manifest.gsx) {
      setStatus(`Loading GSX data… (${++done}/${totalFiles}) ${path}`);
      const rows = await Model.loadFile(path);
      gsxRows = gsxRows.concat(rows);
    }

    setStatus('Matching Servify ↔ GSX and computing TAT…');
    await nextFrame();

    let locationMap = null;
    try {
      const locRes = await fetch('data/location_mapping.json', { cache: 'no-store' });
      if (locRes.ok) {
        const locJson = await locRes.json();
        locationMap = locJson.locations || null;
      }
    } catch (e) {
      console.warn('location_mapping.json not found or unreadable — Area filter and centre-name merges will be skipped.', e);
    }

    MODEL = Model.build(servifyRows, gsxRows, locationMap);

    // Determine latest date in the dataset for default reporting date
    let maxT = 0;
    for (const r of MODEL.records) {
      if (r.servifyCreation && r.servifyCreation.getTime() > maxT) maxT = r.servifyCreation.getTime();
    }
    LATEST_DATE = maxT ? new Date(maxT) : new Date();
    FilterState.setDefaultReportingDate(LATEST_DATE);

    buildFilterBar();
    buildTabNav();
    hideLoading();
    renderActiveTab();
  } catch (err) {
    console.error(err);
    setStatus(null);
    document.getElementById('load-error').style.display = 'block';
    document.getElementById('load-error-detail').textContent = err.message || String(err);
  }
}

function setStatus(msg) {
  const el = document.getElementById('load-status');
  if (!msg) { return; }
  el.textContent = msg;
}
function hideLoading() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
}
function nextFrame() { return new Promise(res => requestAnimationFrame(() => setTimeout(res, 0))); }

/* ---------------- Filter bar ---------------- */

function distinctValues(records, field) {
  return Array.from(new Set(records.map(r => r[field]).filter(Boolean))).sort();
}

function buildFilterBar() {
  const records = MODEL.records;
  const centres = distinctValues(records, 'centre');
  const cities = distinctValues(records, 'city');
  const states = distinctValues(records, 'state');
  const regions = distinctValues(records, 'region');
  const repairTypes = ['NTF', 'Carry-In', 'Mail-In', 'Other / Unknown'];
  const areas = distinctValues(records, 'area');

  const bar = document.getElementById('filter-bar');
  bar.innerHTML = `
    <div class="filter-group period-group">
      ${['FTD', 'WTD', 'MTD', 'QTD', 'CUSTOM'].map(p => `<button class="period-btn ${FilterState.state.period === p ? 'active' : ''}" data-period="${p}">${p === 'CUSTOM' ? 'Custom' : p}</button>`).join('')}
      <input type="date" id="reporting-date" value="${Utils.isoDay(FilterState.state.reportingDate)}" title="Reporting date" />
      <span id="custom-range" class="custom-range" style="display:${FilterState.state.period === 'CUSTOM' ? 'inline-flex' : 'none'}">
        <input type="date" id="custom-start" title="Start date" />
        <span>–</span>
        <input type="date" id="custom-end" title="End date" />
      </span>
      <span class="period-label" id="period-label"></span>
    </div>
    <div class="filter-group select-group">
      ${multiSelectHtml('centre', 'Centre', centres)}
      ${multiSelectHtml('city', 'City', cities)}
      ${multiSelectHtml('state', 'State', states)}
      ${multiSelectHtml('region', 'Region', regions)}
      ${multiSelectHtml('area', 'Area (ARM)', areas)}
      ${multiSelectHtml('repairType', 'Repair Type', repairTypes)}
      <button id="clear-filters" class="clear-filters-btn">Clear filters</button>
    </div>
  `;

  bar.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      FilterState.state.period = btn.dataset.period;
      bar.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('custom-range').style.display = btn.dataset.period === 'CUSTOM' ? 'inline-flex' : 'none';
      renderActiveTab();
    });
  });
  document.getElementById('reporting-date').addEventListener('change', (e) => {
    FilterState.state.reportingDate = e.target.value ? new Date(e.target.value + 'T23:59:59') : LATEST_DATE;
    renderActiveTab();
  });
  document.getElementById('custom-start').addEventListener('change', (e) => { FilterState.state.customStart = e.target.value ? new Date(e.target.value) : null; renderActiveTab(); });
  document.getElementById('custom-end').addEventListener('change', (e) => { FilterState.state.customEnd = e.target.value ? new Date(e.target.value) : null; renderActiveTab(); });

  ['centre', 'city', 'state', 'region', 'area', 'repairType'].forEach(field => wireMultiSelect(field));

  document.getElementById('clear-filters').addEventListener('click', () => {
    FilterState.state.centres = []; FilterState.state.cities = []; FilterState.state.states = [];
    FilterState.state.regions = []; FilterState.state.repairTypes = []; FilterState.state.areas = [];
    buildFilterBar();
    renderActiveTab();
  });
}

function multiSelectHtml(field, label, options) {
  const stateKeyMap = { centre: 'centres', city: 'cities', state: 'states', region: 'regions', repairType: 'repairTypes', area: 'areas' };
  const selected = FilterState.state[stateKeyMap[field]] || [];
  return `
    <div class="multiselect" data-field="${field}">
      <button class="ms-toggle">${label}${selected.length ? ` (${selected.length})` : ''}</button>
      <div class="ms-panel">
        ${options.map(o => `<label><input type="checkbox" value="${Utils.escapeHtml(o)}" ${selected.includes(o) ? 'checked' : ''}/> ${Utils.escapeHtml(o)}</label>`).join('')}
      </div>
    </div>`;
}

function wireMultiSelect(field) {
  const stateKeyMap = { centre: 'centres', city: 'cities', state: 'states', region: 'regions', repairType: 'repairTypes', area: 'areas' };
  const el = document.querySelector(`.multiselect[data-field="${field}"]`);
  if (!el) return;
  const toggle = el.querySelector('.ms-toggle');
  const panel = el.querySelector('.ms-panel');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.ms-panel.open').forEach(p => { if (p !== panel) p.classList.remove('open'); });
    panel.classList.toggle('open');
  });
  panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = Array.from(panel.querySelectorAll('input:checked')).map(c => c.value);
      FilterState.state[stateKeyMap[field]] = checked;
      toggle.textContent = `${toggle.textContent.replace(/\s*\(\d+\)$/, '')}${checked.length ? ` (${checked.length})` : ''}`;
      renderActiveTab();
    });
  });
}
document.addEventListener('click', () => document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open')));

function setCentreFilter(centreName) {
  FilterState.state.centres = [centreName];
  buildFilterBar();
  switchTab('centres');
}

/* ---------------- Tab nav ---------------- */

function buildTabNav() {
  const nav = document.getElementById('tab-nav');
  nav.innerHTML = TABS.map(t => `<button class="tab-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
  nav.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
}

function switchTab(id) {
  activeTab = id;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + id));
  renderActiveTab();
}

/* ---------------- Master render ---------------- */

function buildContext() {
  const filtered = FilterState.apply(MODEL.records);
  const reportingNow = FilterState.state.reportingDate || LATEST_DATE;
  const centreStats = Aggregate.summarize(filtered, r => r.centre, { reportingNow });
  const engineerStats = Aggregate.summarize(filtered.filter(r => r.engineer), r => r.engineer, { reportingNow });
  const cceStats = Aggregate.summarize(filtered.filter(r => r.cce), r => r.cce, { reportingNow });

  const network = {
    volume: Aggregate.benchmarks(centreStats, 'volume'),
    sdr: Aggregate.benchmarks(centreStats, 'sdrPct'),
    avgTat: Aggregate.benchmarks(centreStats, 'avgTat'),
  };

  // Daily trend across the filtered window
  const byDay = new Map();
  filtered.forEach(r => {
    const day = Utils.isoDay(r.servifyCreation);
    if (!day) return;
    if (!byDay.has(day)) byDay.set(day, { volume: 0, sdr: 0, valid: 0 });
    const d = byDay.get(day);
    d.volume++;
    if (r.repairCreationTatHours !== null && r.repairCreationTatHours !== undefined) {
      d.valid++;
      if (r.repairCreationTatHours <= 8) d.sdr++;
    }
  });
  const dailyTrend = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, d]) => ({ label: day.slice(5), volume: d.volume, sdrPct: d.valid ? (d.sdr / d.valid) * 100 : null }));

  return { records: filtered, centreStats, engineerStats, cceStats, network, dailyTrend, reportingNow };
}

function renderActiveTab() {
  if (!MODEL) return;
  document.getElementById('period-label').textContent = FilterState.periodLabel();
  const overviewLabel = document.getElementById('period-label-overview');
  if (overviewLabel) overviewLabel.textContent = FilterState.periodLabel();
  if (activeTab === 'dataquality') {
    const ctx = buildContext();
    renderDataQuality(MODEL.dataQuality, ctx);
    return;
  }
  const ctx = buildContext();
  const tab = TABS.find(t => t.id === activeTab);
  if (tab && tab.render) tab.render(ctx);
}

document.addEventListener('DOMContentLoaded', boot);
