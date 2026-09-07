/* ==========================================================================
   table.js — generic sortable / searchable / paginated table renderer
   ========================================================================== */

function renderTable(container, opts) {
  // opts: { id, columns: [{key,label,align,fmt,sortValue}], rows, pageSize, searchable, defaultSort:{key,dir}, onRowClick, csvName }
  const state = container._tableState || { sortKey: opts.defaultSort?.key, sortDir: opts.defaultSort?.dir || 'desc', search: '', page: 0 };
  container._tableState = state;

  const pageSize = opts.pageSize || 15;

  function getRows() {
    let rows = opts.rows;
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(r => opts.columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)));
    }
    if (state.sortKey) {
      const col = opts.columns.find(c => c.key === state.sortKey);
      rows = [...rows].sort((a, b) => {
        const av = col?.sortValue ? col.sortValue(a) : a[state.sortKey];
        const bv = col?.sortValue ? col.sortValue(b) : b[state.sortKey];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (av < bv) return state.sortDir === 'asc' ? -1 : 1;
        if (av > bv) return state.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }

  function draw() {
    const allRows = getRows();
    const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
    state.page = Math.min(state.page, totalPages - 1);
    const pageRows = allRows.slice(state.page * pageSize, (state.page + 1) * pageSize);

    const toolbarHtml = `
      <div class="tbl-toolbar">
        ${opts.searchable !== false ? `<input type="text" class="tbl-search" placeholder="Search..." value="${Utils.escapeHtml(state.search)}" />` : '<span></span>'}
        <div class="tbl-toolbar-right">
          <span class="tbl-count">${allRows.length} rows</span>
          <button class="tbl-export">Export CSV</button>
        </div>
      </div>`;

    const headHtml = `<tr>${opts.columns.map(c => {
      const active = state.sortKey === c.key;
      const arrow = active ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th data-key="${c.key}" class="${c.align === 'right' ? 'ta-r' : ''} ${active ? 'sorted' : ''}">${Utils.escapeHtml(c.label)}${arrow}</th>`;
    }).join('')}</tr>`;

    const bodyHtml = pageRows.map(r => {
      const cells = opts.columns.map(c => {
        const val = c.fmt ? c.fmt(r) : (r[c.key] ?? '—');
        return `<td class="${c.align === 'right' ? 'ta-r' : ''}">${val}</td>`;
      }).join('');
      const clickable = opts.onRowClick ? ' class="row-clickable"' : '';
      return `<tr${clickable} data-rowkey="${Utils.escapeHtml(r.key ?? '')}">${cells}</tr>`;
    }).join('') || `<tr><td colspan="${opts.columns.length}" class="tbl-empty">No data for the current filters.</td></tr>`;

    const pagerHtml = `
      <div class="tbl-pager">
        <button class="tbl-prev" ${state.page === 0 ? 'disabled' : ''}>Prev</button>
        <span>Page ${state.page + 1} of ${totalPages}</span>
        <button class="tbl-next" ${state.page >= totalPages - 1 ? 'disabled' : ''}>Next</button>
      </div>`;

    container.innerHTML = `
      ${toolbarHtml}
      <div class="tbl-scroll"><table class="data-table"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table></div>
      ${pagerHtml}
    `;

    if (opts.searchable !== false) {
      container.querySelector('.tbl-search').addEventListener('input', (e) => {
        state.search = e.target.value; state.page = 0; draw();
      });
    }
    container.querySelectorAll('th[data-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = 'desc'; }
        draw();
      });
    });
    container.querySelector('.tbl-export')?.addEventListener('click', () => {
      const headers = opts.columns.map(c => c.label);
      const csvRows = allRows.map(r => {
        const o = {};
        opts.columns.forEach(c => { o[c.label] = c.csvValue ? c.csvValue(r) : (r[c.key] ?? ''); });
        return o;
      });
      Utils.downloadCsv((opts.csvName || 'export') + '.csv', csvRows, headers);
    });
    container.querySelector('.tbl-prev')?.addEventListener('click', () => { state.page--; draw(); });
    container.querySelector('.tbl-next')?.addEventListener('click', () => { state.page++; draw(); });
    if (opts.onRowClick) {
      container.querySelectorAll('tr.row-clickable').forEach(tr => {
        tr.addEventListener('click', () => opts.onRowClick(tr.dataset.rowkey));
      });
    }
  }

  draw();
}
