/* ==========================================================================
   charts.js — thin Chart.js wrappers, tracked so filters can redraw cleanly
   ========================================================================== */

const Charts = (() => {
  const instances = {};

  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }

  const PALETTE = ['#2A5CA6', '#4E9B7E', '#C9A24B', '#B4573D', '#7B6FA8', '#3C8DA3', '#8A8F98'];
  const STATUS_COLORS = { green: '#3F8F5F', amber: '#C9922B', red: '#B4423A' };

  function bar(canvasId, labels, datasets, opts = {}) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: datasets.map((d, i) => ({ backgroundColor: d.color || PALETTE[i % PALETTE.length], borderRadius: 3, maxBarThickness: 34, ...d })) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1, labels: { boxWidth: 12, font: { family: 'Inter', size: 11 } } }, tooltip: { titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, autoSkip: false, maxRotation: opts.rotateLabels ? 45 : 0 } },
          y: { beginAtZero: true, grid: { color: '#EEF0F3' }, ticks: { font: { family: 'Inter', size: 11 } } },
        },
        ...opts.chartOptions,
      },
    });
  }

  function line(canvasId, labels, datasets, opts = {}) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: datasets.map((d, i) => ({ borderColor: d.color || PALETTE[i % PALETTE.length], backgroundColor: 'transparent', tension: 0.25, pointRadius: 2, borderWidth: 2, ...d })) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1, labels: { boxWidth: 12, font: { family: 'Inter', size: 11 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, grid: { color: '#EEF0F3' }, ticks: { font: { family: 'Inter', size: 11 } } },
          ...(opts.dualAxis ? { y1: { position: 'right', beginAtZero: true, max: 100, grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } } } : {}),
        },
      },
    });
  }

  function donut(canvasId, labels, data, colors) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors || PALETTE, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { family: 'Inter', size: 11 } } } },
      },
    });
  }

  // Quadrant bubble chart: x = volume, y = performance %, radius scaled to volume
  function quadrant(canvasId, points, opts = {}) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const xMid = opts.xMid, yMid = opts.yMid;
    const colorFor = (p) => {
      if (p.x >= xMid && p.y >= yMid) return '#3F8F5F';       // star
      if (p.x >= xMid && p.y < yMid) return '#B4423A';        // stressed
      if (p.x < xMid && p.y >= yMid) return '#2A5CA6';        // efficient/under-utilised
      return '#C9922B';                                        // low volume, needs attention
    };
    instances[canvasId] = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [{
          data: points.map(p => ({ x: p.x, y: p.y, r: p.r })),
          backgroundColor: points.map(p => colorFor(p) + 'CC'),
          borderColor: points.map(p => colorFor(p)),
          borderWidth: 1.5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx2) => {
                const p = points[ctx2.dataIndex];
                return `${p.label}: ${p.x} devices, ${p.y.toFixed(1)}% SDR`;
              },
            },
          },
          annotationLines: true,
        },
        scales: {
          x: { title: { display: true, text: opts.xLabel || 'Device Volume', font: { family: 'Inter', size: 12 } }, grid: { color: '#EEF0F3' }, ticks: { font: { family: 'Inter', size: 11 } } },
          y: { title: { display: true, text: opts.yLabel || 'Same Day Repair %', font: { family: 'Inter', size: 12 } }, min: 0, max: 100, grid: { color: '#EEF0F3' }, ticks: { font: { family: 'Inter', size: 11 } } },
        },
      },
      plugins: [{
        id: 'quadrantLines',
        afterDraw(chart) {
          const { ctx: c, chartArea, scales } = chart;
          if (!chartArea) return;
          c.save();
          c.strokeStyle = '#D7DBE1'; c.setLineDash([4, 4]); c.lineWidth = 1;
          const xPix = scales.x.getPixelForValue(xMid);
          const yPix = scales.y.getPixelForValue(yMid);
          c.beginPath(); c.moveTo(xPix, chartArea.top); c.lineTo(xPix, chartArea.bottom); c.stroke();
          c.beginPath(); c.moveTo(chartArea.left, yPix); c.lineTo(chartArea.right, yPix); c.stroke();
          c.restore();
        },
      }],
    });
  }

  return { bar, line, donut, quadrant, destroy, PALETTE, STATUS_COLORS };
})();
