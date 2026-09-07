/* ==========================================================================
   filters.js — global filter state, period math, record filtering
   ========================================================================== */

const FilterState = (() => {

  const state = {
    period: 'MTD',              // FTD | WTD | MTD | QTD | CUSTOM
    reportingDate: null,        // Date — defaults to latest date in dataset
    customStart: null,
    customEnd: null,
    centres: [],                // empty = all
    cities: [],
    states: [],
    regions: [],
    repairTypes: [],
    areas: [],
    deviceGroups: [],
    centreTypes: [],
    sdrEligibility: [],
  };

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
  function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

  function startOfWeek(d) {
    // Monday-start week
    const day = d.getDay(); // 0=Sun..6=Sat
    const diff = (day === 0 ? 6 : day - 1);
    const s = startOfDay(d);
    s.setDate(s.getDate() - diff);
    return s;
  }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0); }
  function startOfQuarter(d) {
    const q = Math.floor(d.getMonth() / 3);
    return new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0);
  }

  function range() {
    const rd = state.reportingDate || new Date();
    if (state.period === 'FTD') return { start: startOfDay(rd), end: endOfDay(rd) };
    if (state.period === 'WTD') return { start: startOfWeek(rd), end: endOfDay(rd) };
    if (state.period === 'MTD') return { start: startOfMonth(rd), end: endOfDay(rd) };
    if (state.period === 'QTD') return { start: startOfQuarter(rd), end: endOfDay(rd) };
    if (state.period === 'CUSTOM' && state.customStart && state.customEnd) {
      return { start: startOfDay(state.customStart), end: endOfDay(state.customEnd) };
    }
    return { start: startOfMonth(rd), end: endOfDay(rd) };
  }

  function setDefaultReportingDate(latestDate) {
    if (!state.reportingDate) state.reportingDate = latestDate;
  }

  function matchesMultiSelect(value, selected) {
    if (!selected || !selected.length) return true;
    return selected.includes(value);
  }

  // Filters the full matched-record set down to what's in scope for the
  // current global filters. Time period is applied on Servify request
  // creation date (the universal "when was this device handled" anchor).
  function apply(records) {
    const { start, end } = range();
    const startT = start.getTime(), endT = end.getTime();
    return records.filter(r => {
      if (!r.servifyCreation) return false;
      const t = r.servifyCreation.getTime();
      if (t < startT || t > endT) return false;
      if (!matchesMultiSelect(r.centre, state.centres)) return false;
      if (!matchesMultiSelect(r.city, state.cities)) return false;
      if (!matchesMultiSelect(r.state, state.states)) return false;
      if (!matchesMultiSelect(r.region, state.regions)) return false;
      if (!matchesMultiSelect(r.repairType, state.repairTypes)) return false;
      if (!matchesMultiSelect(r.area, state.areas)) return false;
      if (!matchesMultiSelect(r.deviceGroup, state.deviceGroups)) return false;
      if (!matchesMultiSelect(r.centreType, state.centreTypes)) return false;
      if (!matchesMultiSelect(r.sdrEligible, state.sdrEligibility)) return false;
      return true;
    });
  }

  function periodLabel() {
    const { start, end } = range();
    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) return Utils.fmtDate(start);
    return `${Utils.fmtDate(start)} – ${Utils.fmtDate(end)}`;
  }

  return { state, range, setDefaultReportingDate, apply, periodLabel, startOfDay, endOfDay };
})();
