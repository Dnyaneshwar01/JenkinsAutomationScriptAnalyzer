const ExcelJS = require('exceljs');
const { donutChartPng, barChartPng } = require('./chartRenderer');

// Palette: status colors carry state (always next to a label), blue carries magnitude.
const COLOR = {
  header: '1F2A37',
  headerText: 'FFFFFF',
  title: '1F2A37',
  subtitle: '52514E',
  muted: '898781',
  border: 'D9DDE3',
  zebra: 'F7F9FB',
  tile: 'F4F6F8',
  accent: '2A78D6',
  good: '0CA30C',
  goodText: '006300',
  goodTint: 'E5F5E5',
  warning: 'FAB219',
  warningText: '8A5A00',
  warningTint: 'FEF4DA',
  critical: 'D03B3B',
  criticalTint: 'FBE6E6',
  link: '0563C1',
};
const argb = (hex) => `FF${hex}`;
const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const thin = { style: 'thin', color: { argb: argb(COLOR.border) } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const FONT = 'Calibri';

async function buildFailureReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Jenkins Cucumber Failure Analyzer';
  workbook.created = new Date();

  addDashboardSheet(workbook, report);
  addFailuresSheet(workbook, report);
  addRootCausesSheet(workbook, report);
  addFailingStepsSheet(workbook, report);

  return workbook;
}

function hasComparison(report) {
  return Boolean(report.comparison && !report.comparison.error);
}

function hasReruns(summary) {
  return Boolean(summary.reruns && summary.reruns.rerunScenarios > 0);
}

function trendLabel(report, failure) {
  if (!hasComparison(report)) return '';
  return failure.isNew ? 'New' : 'Recurring';
}

const STATUS_LABELS = { passed: 'Passed', failed: 'Failed', undefined: 'Undefined', pending: 'Pending' };

// e.g. "Failed → Failed"; empty for reports without per-run data.
function runHistory(failure) {
  return (failure.attempts || []).map((a) => STATUS_LABELS[a.status] || a.status).join(' → ');
}

const percentText = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
// A real number with a percent format, so Excel does not flag it as text.
const ratio = (part, whole) => (whole ? part / whole : '–');

function categoryCounts(groups) {
  const counts = new Map();
  for (const group of groups) {
    const category = group.category || 'Other';
    counts.set(category, (counts.get(category) || 0) + group.count);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

// Wrapped text does not grow rows in Excel on its own, so size rows from the longest wrapped cell.
function fitRowHeight(row, wrappedWidths, { min = 18, max = 150 } = {}) {
  let lines = 1;
  row.eachCell((cell, col) => {
    const width = wrappedWidths[col];
    if (!width) return;
    const text = typeof cell.value === 'string' ? cell.value : (cell.value && cell.value.text) || '';
    const cellLines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (width * 1.15))), 0);
    lines = Math.max(lines, cellLines);
  });
  row.height = Math.min(max, Math.max(min, lines * 15 + 4));
}

function styleHeaderRow(row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, size: 11, color: { argb: argb(COLOR.headerText) } };
    cell.fill = fill(COLOR.header);
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    cell.border = BORDER;
  });
}

function styleDataRow(row, index) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: FONT, size: 10, ...(cell.font || {}) };
    cell.border = BORDER;
    cell.alignment = { vertical: 'top', wrapText: true, ...(cell.alignment || {}) };
    if (index % 2 === 1 && !cell.fill) cell.fill = fill(COLOR.zebra);
  });
}

// A table sheet with a styled header, frozen header row and filter.
function startTableSheet(workbook, name, columns, tabColor) {
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: argb(tabColor) } },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  sheet.columns = columns;
  styleHeaderRow(sheet.getRow(1));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const wrappedWidths = {};
  columns.forEach((c, i) => {
    if (c.wrap) wrappedWidths[i + 1] = c.width;
  });
  return { sheet, wrappedWidths };
}

// ---------- Dashboard ----------

const DASH_COLS = 12;
const DASH_COL_WIDTH = 13;

function mergeRow(sheet, row, value, style) {
  sheet.mergeCells(row, 1, row, DASH_COLS);
  const cell = sheet.getCell(row, 1);
  cell.value = value;
  Object.assign(cell, style);
  return cell;
}

function sectionTitle(sheet, row, text) {
  mergeRow(sheet, row, text, {
    font: { name: FONT, bold: true, size: 13, color: { argb: argb(COLOR.title) } },
    border: { bottom: { style: 'medium', color: { argb: argb(COLOR.accent) } } },
    alignment: { vertical: 'bottom' },
  });
  sheet.getRow(row).height = 24;
}

// tiles: [{ label, value, numFmt, tone, note }] laid out two columns each across the dashboard.
function addTiles(sheet, startRow, tiles) {
  const toneColor = { good: COLOR.goodText, bad: COLOR.critical, warn: COLOR.warningText };
  tiles.forEach((tile, i) => {
    const col = 1 + i * 2;
    const rows = [
      [startRow, tile.label, { name: FONT, size: 9, bold: true, color: { argb: argb(COLOR.subtitle) } }],
      [startRow + 1, tile.value, { name: FONT, size: 22, bold: true, color: { argb: argb(toneColor[tile.tone] || COLOR.title) } }],
      [startRow + 2, tile.note || '', { name: FONT, size: 9, color: { argb: argb(COLOR.muted) } }],
    ];
    for (const [row, value, font] of rows) {
      sheet.mergeCells(row, col, row, col + 1);
      const cell = sheet.getCell(row, col);
      cell.value = value;
      cell.font = font;
      if (row === startRow + 1 && tile.numFmt) cell.numFmt = tile.numFmt;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      for (const c of [col, col + 1]) {
        const target = sheet.getCell(row, c);
        target.fill = fill(COLOR.tile);
        target.border = {
          left: c === col ? { style: 'medium', color: { argb: argb('FFFFFF') } } : undefined,
          right: c === col + 1 ? { style: 'medium', color: { argb: argb('FFFFFF') } } : undefined,
          top: row === startRow ? { style: 'thick', color: { argb: argb(toneColor[tile.tone] ? toneColor[tile.tone] : COLOR.accent) } } : undefined,
        };
      }
    }
  });
  sheet.getRow(startRow).height = 20;
  sheet.getRow(startRow + 1).height = 36;
  sheet.getRow(startRow + 2).height = 18;
}

function featureTiles(summary) {
  const { features } = summary;
  const reruns = hasReruns(summary);
  const tiles = [
    { label: 'FEATURE FILES', value: features.total, note: `${summary.total} scenarios` },
    { label: 'PASSED', value: features.passed, tone: 'good', note: reruns ? 'after re-run' : '' },
    { label: reruns ? 'FAILED AFTER RE-RUN' : 'FAILED', value: features.failed, tone: features.failed ? 'bad' : 'good', note: `${summary.failed + summary.undefined + summary.pending} failing scenarios` },
    { label: reruns ? 'PASS RATE AFTER RE-RUN' : 'PASS RATE', value: ratio(features.passed, features.total), numFmt: '0%', tone: 'good' },
  ];
  if (reruns) {
    tiles.push(
      { label: 'FIXED BY RE-RUN', value: features.passedOnRerun, tone: 'warn', note: `of ${features.firstRunFailed} failed in 1st run` },
      { label: '1ST-RUN PASS RATE', value: ratio(features.total - features.firstRunFailed, features.total), numFmt: '0%', note: 'before re-run' }
    );
  }
  return tiles;
}

function scenarioTiles(summary) {
  return [
    { label: 'SCENARIOS', value: summary.total },
    { label: 'PASSED', value: summary.passed, tone: 'good' },
    { label: 'FAILED', value: summary.failed, tone: summary.failed ? 'bad' : 'good' },
    { label: 'UNDEFINED', value: summary.undefined },
    { label: 'PENDING', value: summary.pending },
    { label: 'PASS RATE', value: ratio(summary.passed, summary.total), numFmt: '0%', tone: 'good' },
  ];
}

function featureSlices(summary) {
  const { features } = summary;
  if (hasReruns(summary)) {
    return [
      { label: 'Passed in 1st run', value: features.passed - features.passedOnRerun, color: `#${COLOR.good}` },
      { label: 'Fixed by re-run', value: features.passedOnRerun, color: `#${COLOR.warning}` },
      { label: 'Failed after re-run', value: features.failed, color: `#${COLOR.critical}` },
    ];
  }
  return [
    { label: 'Passed', value: features.passed, color: `#${COLOR.good}` },
    { label: 'Failed', value: features.failed, color: `#${COLOR.critical}` },
  ];
}

function scenarioSlices(summary) {
  return [
    { label: 'Passed', value: summary.passed, color: `#${COLOR.good}` },
    { label: 'Failed', value: summary.failed, color: `#${COLOR.critical}` },
    { label: 'Undefined / pending', value: summary.undefined + summary.pending, color: `#${COLOR.warning}` },
  ];
}

const CHART_SIZE = { width: 520, height: 300 };

function addChart(workbook, sheet, png, col, row) {
  const imageId = workbook.addImage({ buffer: png, extension: 'png' });
  sheet.addImage(imageId, { tl: { col, row }, ext: CHART_SIZE, editAs: 'oneCell' });
}

// Two-column key/value rows: label over columns startCol..startCol+2, value in the next column.
function addKeyValues(sheet, startRow, startCol, rows) {
  rows.forEach(([label, value, tone], i) => {
    const row = startRow + i;
    // Rows without a value (headings, notes) use the full width.
    sheet.mergeCells(row, startCol, row, startCol + (value === '' ? 3 : 2));
    const labelCell = sheet.getCell(row, startCol);
    labelCell.value = label;
    labelCell.font = { name: FONT, size: 10, color: { argb: argb(COLOR.subtitle) } };
    if (value !== '') {
      const valueCell = sheet.getCell(row, startCol + 3);
      valueCell.value = value;
      valueCell.font = { name: FONT, size: 10, bold: true, color: { argb: argb(tone || COLOR.title) } };
      valueCell.alignment = { horizontal: 'right' };
    }
    for (let c = startCol; c <= startCol + 3; c += 1) {
      sheet.getCell(row, c).border = { bottom: thin };
      if (i % 2 === 1) sheet.getCell(row, c).fill = fill(COLOR.zebra);
    }
  });
  return startRow + rows.length;
}

function addDashboardSheet(workbook, report) {
  const sheet = workbook.addWorksheet('Dashboard', {
    properties: { tabColor: { argb: argb(COLOR.accent) } },
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  for (let c = 1; c <= DASH_COLS; c += 1) sheet.getColumn(c).width = DASH_COL_WIDTH;

  const { jobName, buildNumber, buildUrl, summary, groups } = report;
  const platform = (report.platform && report.platform.label) || '';

  // Title banner
  mergeRow(sheet, 1, `Automation Failure Report  ·  ${jobName} #${buildNumber}`, {
    font: { name: FONT, bold: true, size: 18, color: { argb: argb(COLOR.headerText) } },
    fill: fill(COLOR.header),
    alignment: { vertical: 'middle', indent: 1 },
  });
  sheet.getRow(1).height = 40;

  const generated = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const meta = [platform && `Platform: ${platform}`, report.buildResult && `Jenkins result: ${report.buildResult}`, `Generated: ${generated}`]
    .filter(Boolean)
    .join('     ');
  mergeRow(sheet, 2, meta, {
    font: { name: FONT, size: 10, color: { argb: argb(COLOR.headerText) } },
    fill: fill(COLOR.header),
    alignment: { vertical: 'middle', indent: 1 },
  });
  sheet.getRow(2).height = 20;
  mergeRow(sheet, 3, { text: buildUrl, hyperlink: buildUrl }, {
    font: { name: FONT, size: 10, underline: true, color: { argb: argb(COLOR.link) } },
    alignment: { vertical: 'middle', indent: 1 },
  });
  sheet.getRow(3).height = 20;

  // Headline numbers
  const perFeature = Boolean(summary.features);
  sectionTitle(sheet, 5, perFeature ? 'Feature files' : 'Scenarios');
  addTiles(sheet, 6, perFeature ? featureTiles(summary) : scenarioTiles(summary));

  // Charts
  sectionTitle(sheet, 10, 'At a glance');
  const donut = perFeature
    ? donutChartPng({
        title: hasReruns(summary) ? 'Feature files after re-run' : 'Feature file results',
        slices: featureSlices(summary),
        centerValue: percentText(summary.features.passed, summary.features.total),
        centerLabel: 'pass rate',
        ...CHART_SIZE,
      })
    : donutChartPng({
        title: 'Scenario results',
        slices: scenarioSlices(summary),
        centerValue: percentText(summary.passed, summary.total),
        centerLabel: 'pass rate',
        ...CHART_SIZE,
      });
  // Rows 11-22 hold the charts: 12 rows of 20pt (~27px) fit the 300px images.
  addChart(workbook, sheet, donut, 0, 10.2);
  addChart(workbook, sheet, barChartPng({ title: 'Failing scenarios by category', bars: categoryCounts(groups), ...CHART_SIZE }), 6, 10.2);
  for (let r = 11; r <= 22; r += 1) sheet.getRow(r).height = 20;

  // Detail tables, side by side
  let row = 24;
  sectionTitle(sheet, row, 'Details');
  row += 1;

  const left = [['Scenarios', '']];
  left.push(['Total scenarios', summary.total], ['Passed', summary.passed, COLOR.goodText], ['Failed', summary.failed, summary.failed ? COLOR.critical : null]);
  if (summary.undefined) left.push(['Undefined', summary.undefined]);
  if (summary.pending) left.push(['Pending', summary.pending]);
  if (hasReruns(summary)) {
    const { reruns, features } = summary;
    left.push(
      ['Total runs (incl. re-runs)', reruns.totalAttempts],
      ['Failed in 1st run', reruns.firstRunFailed],
      ['Fixed by re-run', reruns.passedOnRerun, COLOR.warningText],
      ['Feature files re-run', features.rerun]
    );
  }

  const right = [];
  const { comparison } = report;
  if (hasComparison(report)) {
    right.push([`vs build #${comparison.previousBuildNumber}`, '']);
    right.push(
      ['New failures', comparison.newCount, comparison.newCount ? COLOR.critical : null],
      ['Recurring failures', comparison.recurringCount],
      ['Fixed since previous build', comparison.fixedCount, COLOR.goodText]
    );
    const params = (comparison.matchedOn || []).map((p) => `${p.name}=${p.value}`).join(', ');
    if (params) right.push([`Same ${params}`, '']);
  } else if (comparison && comparison.error) {
    right.push(['Previous build comparison', ''], [`Unavailable: ${comparison.error}`, '']);
  } else {
    right.push(['Previous build comparison', ''], ['No earlier comparable build found', '']);
  }

  const leftEnd = addKeyValues(sheet, row, 1, left);
  const rightEnd = addKeyValues(sheet, row, 7, right);
  // First row of each table is its heading.
  for (const col of [1, 7]) {
    const head = sheet.getCell(row, col);
    head.font = { name: FONT, size: 11, bold: true, color: { argb: argb(COLOR.title) } };
  }
  sheet.getRow(row).height = 20;

  const noteRow = Math.max(leftEnd, rightEnd) + 1;
  if (hasReruns(summary)) {
    mergeRow(sheet, noteRow, 'Failed feature files are re-run in the same build. Each feature file and scenario is counted once, by its last run; scenarios that passed on re-run are not listed in Failures.', {
      font: { name: FONT, size: 9, italic: true, color: { argb: argb(COLOR.muted) } },
      alignment: { wrapText: true, vertical: 'top' },
    });
    sheet.getRow(noteRow).height = 28;
  }
}

// ---------- Failures ----------

function addFailuresSheet(workbook, report) {
  const columns = [
    { header: 'Feature', key: 'feature', width: 32, wrap: true },
    { header: 'Scenario', key: 'scenario', width: 36, wrap: true },
    { header: 'Failed Step', key: 'failedStep', width: 36, wrap: true },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'vs Previous Build', key: 'trend', width: 16 },
    { header: 'Runs', key: 'runs', width: 9 },
    { header: 'Run History', key: 'runHistory', width: 18, wrap: true },
    { header: 'Root Cause Group', key: 'rootCause', width: 40, wrap: true },
    { header: 'Exception Type', key: 'exceptionType', width: 22, wrap: true },
    { header: 'Error Message', key: 'errorMessage', width: 70, wrap: true },
    { header: 'Tags', key: 'tags', width: 22, wrap: true },
    { header: 'Screenshot', key: 'screenshot', width: 15 },
    { header: 'Build', key: 'build', width: 24, wrap: true },
  ];
  const { sheet, wrappedWidths } = startTableSheet(workbook, 'Failures', columns, COLOR.critical);

  let index = 0;
  for (const group of report.groups) {
    for (const failure of group.failures) {
      const [screenshotUrl] = failure.screenshots || [];
      const row = sheet.addRow({
        rootCause: group.sampleMessage,
        exceptionType: group.exceptionType || '',
        category: group.category || '',
        trend: trendLabel(report, failure),
        feature: failure.feature,
        scenario: failure.scenario,
        failedStep: failure.failedStep,
        runs: failure.runCount || 1,
        runHistory: runHistory(failure),
        errorMessage: failure.errorMessage || '(no error message)',
        tags: (failure.tags || []).join(', '),
        // Links straight to Jenkins, so it opens for anyone logged in there.
        screenshot: screenshotUrl ? { text: 'View screenshot', hyperlink: screenshotUrl } : '',
        build: `${report.jobName} #${report.buildNumber}`,
      });

      row.getCell('feature').font = { name: FONT, size: 10, bold: true };
      row.getCell('errorMessage').font = { name: 'Consolas', size: 9, color: { argb: argb(COLOR.subtitle) } };
      row.getCell('runs').alignment = { horizontal: 'center', vertical: 'top' };
      if (screenshotUrl) row.getCell('screenshot').font = { name: FONT, size: 10, underline: true, color: { argb: argb(COLOR.link) } };

      const trend = row.getCell('trend');
      if (trend.value === 'New') {
        trend.fill = fill(COLOR.criticalTint);
        trend.font = { name: FONT, size: 10, bold: true, color: { argb: argb(COLOR.critical) } };
      } else if (trend.value === 'Recurring') {
        trend.font = { name: FONT, size: 10, color: { argb: argb(COLOR.subtitle) } };
      }
      if ((failure.runCount || 1) > 1) {
        row.getCell('runHistory').fill = fill(COLOR.warningTint);
        row.getCell('runHistory').font = { name: FONT, size: 10, color: { argb: argb(COLOR.warningText) } };
      }

      styleDataRow(row, index);
      fitRowHeight(row, wrappedWidths, { max: 80 });
      index += 1;
    }
  }
}

// ---------- Root causes ----------

function addRootCausesSheet(workbook, report) {
  const comparison = hasComparison(report);
  const columns = [
    { header: 'Root Cause', key: 'rootCause', width: 70, wrap: true },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Exception Type', key: 'exceptionType', width: 24, wrap: true },
    { header: 'Failures', key: 'count', width: 12 },
    { header: 'New', key: 'newCount', width: 9 },
    { header: 'Feature Files', key: 'features', width: 50, wrap: true },
  ];
  const { sheet, wrappedWidths } = startTableSheet(workbook, 'Root Causes', columns, COLOR.warning);

  report.groups.forEach((group, index) => {
    const features = [...new Set(group.failures.map((f) => f.feature))].sort();
    const row = sheet.addRow({
      rootCause: group.sampleMessage,
      category: group.category || '',
      exceptionType: group.exceptionType || '',
      count: group.count,
      newCount: comparison ? group.newCount : '',
      features: features.join('\n'),
    });
    row.getCell('count').font = { name: FONT, size: 10, bold: true };
    row.getCell('count').alignment = { horizontal: 'center', vertical: 'top' };
    row.getCell('newCount').alignment = { horizontal: 'center', vertical: 'top' };
    if (comparison && group.newCount > 0) {
      row.getCell('newCount').font = { name: FONT, size: 10, bold: true, color: { argb: argb(COLOR.critical) } };
    }
    styleDataRow(row, index);
    fitRowHeight(row, wrappedWidths);
  });

  if (report.groups.length > 0) {
    addDataBar(sheet, `D2:D${report.groups.length + 1}`);
  }
}

// ---------- Failing steps ----------

function addFailingStepsSheet(workbook, report) {
  const columns = [
    { header: 'Failing Step (arguments masked)', key: 'step', width: 60, wrap: true },
    { header: 'Failures', key: 'count', width: 12 },
    { header: '% of Failures', key: 'percent', width: 17 },
    { header: 'Feature Files', key: 'features', width: 60, wrap: true },
  ];
  const { sheet, wrappedWidths } = startTableSheet(workbook, 'Failing Steps', columns, COLOR.accent);
  const steps = report.failingSteps || [];

  steps.forEach(({ step, count, percent, features }, index) => {
    const row = sheet.addRow({ step, count, percent: percent / 100, features: (features || []).join('\n') });
    row.getCell('percent').numFmt = '0%';
    row.getCell('count').font = { name: FONT, size: 10, bold: true };
    for (const key of ['count', 'percent']) row.getCell(key).alignment = { horizontal: 'center', vertical: 'top' };
    styleDataRow(row, index);
    fitRowHeight(row, wrappedWidths);
  });

  if (steps.length > 0) {
    addDataBar(sheet, `C2:C${steps.length + 1}`, { min: 0, max: 1 });
  }
}

// In-cell bar showing each value's size (Excel conditional formatting).
function addDataBar(sheet, ref, { min, max } = {}) {
  sheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'dataBar',
        gradient: false,
        border: false,
        cfvo: [min === undefined ? { type: 'num', value: 0 } : { type: 'num', value: min }, max === undefined ? { type: 'max' } : { type: 'num', value: max }],
        color: { argb: argb('9EC5F4') },
      },
    ],
  });
}

module.exports = { buildFailureReportWorkbook };
