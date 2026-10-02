const ExcelJS = require('exceljs');

async function buildFailureReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Jenkins Cucumber Failure Analyzer';
  workbook.created = new Date();

  addSummarySheet(workbook, report);
  addFailuresSheet(workbook, report);
  addFailingStepsSheet(workbook, report);

  return workbook;
}

function hasComparison(report) {
  return Boolean(report.comparison && !report.comparison.error);
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

function addSummarySheet(workbook, report) {
  const sheet = workbook.addWorksheet('Summary');
  const { jobName, buildNumber, buildUrl, summary, groups } = report;

  sheet.addRows([
    ['Platform', (report.platform && report.platform.label) || ''],
    ['Job', jobName],
    ['Build', buildNumber],
    ['Build URL', buildUrl],
    ['Generated', new Date().toISOString()],
    [],
  ]);

  // Feature files are the headline numbers: failed features are what gets re-run.
  const { features, reruns } = summary;
  const rate = (passed, total) => (total ? `${Math.round((passed / total) * 100)}%` : '');
  const rerunInBuild = Boolean(reruns && reruns.rerunScenarios > 0);
  if (features) {
    sheet.addRow(['Feature files', rerunInBuild ? 'each counted once, by its last run' : '']).font = { bold: true };
    sheet.addRows([
      ['Total feature files', features.total],
      ['Passed', features.passed],
      [rerunInBuild ? 'Failed after re-run' : 'Failed', features.failed],
      [rerunInBuild ? 'Pass rate after re-run' : 'Pass rate', rate(features.passed, features.total)],
    ]);
    if (rerunInBuild) {
      sheet.addRows([
        ['Feature files re-run', features.rerun],
        ['Failed in 1st run', features.firstRunFailed],
        ['Fixed by re-run', features.passedOnRerun],
        ['1st-run pass rate', rate(features.total - features.firstRunFailed, features.total)],
      ]);
    }
    sheet.addRow([]);
  }

  sheet.addRow(['Scenarios', features ? 'detail' : '']).font = { bold: true };
  sheet.addRows([
    ['Total scenarios', summary.total],
    ['Passed', summary.passed],
    ['Failed', summary.failed],
    ['Undefined', summary.undefined],
    ['Pending', summary.pending],
  ]);
  if (rerunInBuild) {
    sheet.addRows([
      ['Total runs (incl. re-runs)', reruns.totalAttempts],
      ['Failed in 1st run', reruns.firstRunFailed],
      ['Fixed by re-run', reruns.passedOnRerun],
    ]);
  }
  sheet.addRow([]);

  const { comparison } = report;
  if (hasComparison(report)) {
    const params = (comparison.matchedOn || []).map((p) => `${p.name}=${p.value}`).join(', ');
    sheet.addRows([
      [`Compared with build #${comparison.previousBuildNumber}`, params ? `same ${params}` : ''],
      ['New failures', comparison.newCount],
      ['Recurring failures', comparison.recurringCount],
      ['Fixed since previous build', comparison.fixedCount],
      [],
    ]);
  } else if (comparison && comparison.error) {
    const target = comparison.previousBuildNumber ? `build #${comparison.previousBuildNumber}` : 'previous build';
    sheet.addRows([[`Comparison with ${target} unavailable`, comparison.error], []]);
  }

  const categoryCounts = new Map();
  for (const group of groups) {
    const category = group.category || 'Other';
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + group.count);
  }
  sheet.addRow(['Category', 'Failures']).font = { bold: true };
  for (const [category, count] of [...categoryCounts].sort((a, b) => b[1] - a[1])) {
    sheet.addRow([category, count]);
  }
  sheet.addRow([]);

  const headerRow = sheet.addRow(['Root Cause', 'Exception Type', 'Count', 'Category', 'New']);
  headerRow.font = { bold: true };

  for (const group of groups) {
    sheet.addRow([group.sampleMessage, group.exceptionType || '', group.count, group.category || '', hasComparison(report) ? group.newCount : '']);
  }

  sheet.getColumn(1).width = 70;
  sheet.getColumn(2).width = 25;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 8;
}

function addFailingStepsSheet(workbook, report) {
  const sheet = workbook.addWorksheet('Failing Steps');
  sheet.columns = [
    { header: 'Failing Step (arguments masked)', key: 'step', width: 80 },
    { header: 'Failures', key: 'count', width: 12 },
    { header: '% of Failures', key: 'percent', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const { step, count, percent } of report.failingSteps || []) {
    sheet.addRow({ step, count, percent: `${percent}%` });
  }
}

function addFailuresSheet(workbook, report) {
  const sheet = workbook.addWorksheet('Failures');

  const columns = [
    { header: 'Root Cause Group', key: 'rootCause', width: 50 },
    { header: 'Exception Type', key: 'exceptionType', width: 25 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'vs Previous Build', key: 'trend', width: 16 },
    { header: 'Feature', key: 'feature', width: 30 },
    { header: 'Scenario', key: 'scenario', width: 35 },
    { header: 'Failed Step', key: 'failedStep', width: 35 },
    { header: 'Runs', key: 'runs', width: 8 },
    { header: 'Run History', key: 'runHistory', width: 24 },
    { header: 'Error Message', key: 'errorMessage', width: 60 },
    { header: 'Tags', key: 'tags', width: 25 },
    { header: 'Screenshot', key: 'screenshot', width: 16 },
    { header: 'Build', key: 'build', width: 15 },
  ];
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

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
      if (screenshotUrl) {
        row.getCell('screenshot').font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    }
  }

  sheet.getColumn('errorMessage').alignment = { wrapText: true, vertical: 'top' };
}

module.exports = { buildFailureReportWorkbook };
