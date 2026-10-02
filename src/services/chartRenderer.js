// Draws the Excel dashboard charts as SVG and renders them to PNG (ExcelJS cannot create native charts).
const { Resvg } = require('@resvg/resvg-js');

const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', baseline: '#c3c2b7' };
const SURFACE = '#ffffff';
const FONT = "'Segoe UI', Arial, sans-serif";
const SCALE = 2; // rendered at 2x so the image stays sharp when Excel zooms

const escapeXml = (text) =>
  String(text).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function toPng(svg, width) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width * SCALE },
    font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
    background: SURFACE,
  });
  return Buffer.from(resvg.render().asPng());
}

function frame(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">
  <rect width="${width}" height="${height}" fill="${SURFACE}"/>
  <text x="20" y="32" font-size="16" font-weight="600" fill="${INK.primary}">${escapeXml(title)}</text>
  ${body}
</svg>`;
}

// slices: [{ label, value, color }]. Donut with the headline figure in the middle and a
// legend giving each slice's count and share, so identity never rests on color alone.
function donutChartPng({ title, slices, centerValue, centerLabel, width = 520, height = 300 }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const cx = 150;
  const cy = 170;
  const outer = 105;
  const inner = 66;
  const visible = slices.filter((s) => s.value > 0);

  let arcs = '';
  if (visible.length === 1) {
    const r = (outer + inner) / 2;
    arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${visible[0].color}" stroke-width="${outer - inner}"/>`;
  } else {
    let angle = -Math.PI / 2;
    for (const slice of visible) {
      const sweep = (slice.value / total) * Math.PI * 2;
      const end = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
      arcs += `<path d="M ${p(outer, angle)} A ${outer} ${outer} 0 ${large} 1 ${p(outer, end)} L ${p(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${p(inner, angle)} Z" fill="${slice.color}" stroke="${SURFACE}" stroke-width="2"/>`;
      angle = end;
    }
  }
  if (total === 0) {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${(outer + inner) / 2}" fill="none" stroke="${INK.grid}" stroke-width="${outer - inner}"/>`;
  }

  const center = `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="30" font-weight="700" fill="${INK.primary}">${escapeXml(centerValue)}</text>
  <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="12" fill="${INK.secondary}">${escapeXml(centerLabel)}</text>`;

  const legend = slices
    .map((s, i) => {
      const y = 120 + i * 44;
      const share = total ? Math.round((s.value / total) * 100) : 0;
      return `<rect x="290" y="${y - 11}" width="14" height="14" rx="3" fill="${s.color}"/>
  <text x="314" y="${y}" font-size="13" fill="${INK.secondary}">${escapeXml(s.label)}</text>
  <text x="314" y="${y + 20}" font-size="15" font-weight="600" fill="${INK.primary}">${s.value} <tspan font-size="12" font-weight="400" fill="${INK.muted}">· ${share}%</tspan></text>`;
    })
    .join('\n  ');

  return toPng(frame(width, height, title, `${arcs}\n  ${center}\n  ${legend}`), width);
}

// bars: [{ label, value }], drawn in one hue (magnitude), largest first, with the value at each bar end.
function barChartPng({ title, bars, color = '#2a78d6', width = 520, height = 300 }) {
  const rows = bars.slice(0, 8);
  const labelWidth = 150;
  const left = 20 + labelWidth;
  const right = width - 50;
  const plotTop = 58;
  const plotHeight = height - plotTop - 20;
  const rowHeight = Math.min(44, plotHeight / Math.max(rows.length, 1));
  const barHeight = Math.max(10, Math.round(rowHeight * 0.6));
  // Few categories: keep the bars together in the middle of the plot instead of at the top.
  const top = plotTop + (plotHeight - rowHeight * rows.length) / 2;
  const max = Math.max(1, ...rows.map((b) => b.value));

  const body = rows
    .map((b, i) => {
      const y = top + i * rowHeight;
      const w = Math.max(4, ((right - left) * b.value) / max);
      const mid = y + barHeight / 2;
      // Square at the baseline, 4px rounded at the data end.
      const r = Math.min(4, w / 2);
      const path = `M ${left} ${y} H ${left + w - r} Q ${left + w} ${y} ${left + w} ${y + r} V ${y + barHeight - r} Q ${left + w} ${y + barHeight} ${left + w - r} ${y + barHeight} H ${left} Z`;
      return `<text x="${left - 10}" y="${mid + 4}" text-anchor="end" font-size="12" fill="${INK.secondary}">${escapeXml(truncate(b.label, 24))}</text>
  <path d="${path}" fill="${color}"/>
  <text x="${left + w + 6}" y="${mid + 4}" font-size="12" font-weight="600" fill="${INK.primary}">${b.value}</text>`;
    })
    .join('\n  ');

  const baseline = `<line x1="${left}" y1="${top - 6}" x2="${left}" y2="${top + rows.length * rowHeight - (rowHeight - barHeight) + 6}" stroke="${INK.baseline}" stroke-width="1"/>`;
  const empty = rows.length === 0 ? `<text x="20" y="${top + 20}" font-size="13" fill="${INK.muted}">No failures</text>` : '';

  return toPng(frame(width, height, title, `${baseline}\n  ${body}${empty}`), width);
}

module.exports = { donutChartPng, barChartPng, SCALE };
