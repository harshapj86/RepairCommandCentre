/* ==========================================================================
   utils.js — date parsing, formatting, and statistics helpers
   ========================================================================== */

const Utils = (() => {

  // ---- Date parsing ---------------------------------------------------
  // Servify export dates arrive as native Excel datetimes (SheetJS gives us
  // JS Date objects directly, or ISO-like strings "YYYY-MM-DD HH:MM:SS").
  // GSX "Created Date" / "Unit Received Date" arrive as text strings in
  // DD/MM/YY hh:mm AM/PM format (e.g. "10/07/26 04:33 PM" = 10 July 2026).
  // GSX "Mark Complete Date" arrives as an ISO-like string with fractional
  // seconds. This module normalizes all of these into JS Date objects.

  function parseAny(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number') {
      // Excel serial date number
      const d = excelSerialToDate(value);
      return d;
    }
    const s = String(value).trim();
    if (!s || s === '0' || s === '-' || s === 'null') return null;

    // DD/MM/YY or DD/MM/YYYY with optional "hh:mm AM/PM"
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
    if (m) {
      let [, dd, mo, yy, hh, mi, ss, ap] = m;
      let year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
      let hour = hh ? parseInt(hh, 10) : 0;
      if (ap) {
        const apUpper = ap.toUpperCase();
        if (apUpper === 'PM' && hour < 12) hour += 12;
        if (apUpper === 'AM' && hour === 12) hour = 0;
      }
      const d = new Date(year, parseInt(mo, 10) - 1, parseInt(dd, 10), hour, mi ? parseInt(mi, 10) : 0, ss ? parseInt(ss, 10) : 0);
      return isNaN(d.getTime()) ? null : d;
    }

    // ISO-ish "YYYY-MM-DD HH:MM:SS(.ffffff)?" or "YYYY-MM-DDTHH:MM:SS"
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const [, y, mo, dd, hh, mi, ss] = m;
      const d = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(dd, 10), parseInt(hh, 10), parseInt(mi, 10), parseInt(ss, 10));
      return isNaN(d.getTime()) ? null : d;
    }
    // Plain "YYYY-MM-DD"
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, y, mo, dd] = m;
      const d = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(dd, 10));
      return isNaN(d.getTime()) ? null : d;
    }

    // Fallback: let the JS engine try (last resort — logged as a parse gap)
    const generic = new Date(s);
    return isNaN(generic.getTime()) ? null : generic;
  }

  function excelSerialToDate(serial) {
    // Excel epoch (1899-12-30) accounting for the 1900 leap-year bug
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = serial - Math.floor(serial);
    const totalSeconds = Math.round(fractionalDay * 86400);
    return new Date(dateInfo.getUTCFullYear(), dateInfo.getUTCMonth(), dateInfo.getUTCDate(), 0, 0, totalSeconds);
  }

  function hoursBetween(later, earlier) {
    if (!later || !earlier) return null;
    return (later.getTime() - earlier.getTime()) / 36e5;
  }

  function fmtDate(d) {
    if (!d) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(d) {
    if (!d) return '—';
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function isoDay(d) {
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtNum(n, dp = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function fmtPct(n, dp = 1) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toFixed(dp) + '%';
  }
  function fmtHrs(n, dp = 1) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toFixed(dp) + 'h';
  }

  // ---- Statistics -------------------------------------------------------
  function mean(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  function median(arr) {
    return percentile(arr, 50);
  }
  function percentile(arr, p) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }
  function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
  function pct(part, whole) {
    if (!whole) return null;
    return (part / whole) * 100;
  }

  // Quartile-based ranking helper: returns 'high' | 'medium' | 'low' for a
  // value's position within a distribution (top 25% / middle 50% / bottom 25%)
  function volumeTier(value, allValues) {
    if (!allValues.length) return 'low';
    const p75 = percentile(allValues, 75);
    const p25 = percentile(allValues, 25);
    if (value >= p75) return 'high';
    if (value <= p25) return 'low';
    return 'medium';
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function downloadCsv(filename, rows, headers) {
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(esc).join(',')];
    rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    parseAny, hoursBetween, fmtDate, fmtDateTime, isoDay, fmtNum, fmtPct, fmtHrs,
    mean, median, percentile, sum, pct, volumeTier, escapeHtml, downloadCsv
  };
})();
