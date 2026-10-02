const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFailureReportWorkbook } = require('../../src/services/excelExporter');

const report = {
  jobName: 'Job',
  buildNumber: '5',
  buildUrl: 'http://jenkins/job/Job/5/',
  summary: { total: 3, passed: 1, failed: 2, undefined: 0, pending: 0 },
  comparison: { previousBuildNumber: '4', newCount: 1, recurringCount: 1, fixedCount: 0 },
  failingSteps: [{ step: 'When I log in as "…"', count: 2, percent: 100 }],
  groups: [
    {
      sampleMessage: 'Timeout',
      exceptionType: null,
      category: 'Timeout',
      count: 2,
      newCount: 1,
      failures: [
        { feature: 'F', scenario: 'A', failedStep: 'When I log in as "a"', errorMessage: 'Timeout', tags: ['@x'], isNew: true, screenshots: ['http://jenkins/shot.png'] },
        { feature: 'F', scenario: 'B', failedStep: 'When I log in as "b"', errorMessage: 'Timeout', tags: [], isNew: false, screenshots: [] },
      ],
    },
  ],
};

test('failures sheet includes category, trend and screenshot link columns', async () => {
  const workbook = await buildFailureReportWorkbook(report);
  const sheet = workbook.getWorksheet('Failures');
  const header = sheet.getRow(1).values.slice(1);
  const row = (n, key) => sheet.getRow(n).getCell(header.indexOf(key) + 1).value;

  assert.equal(row(2, 'Category'), 'Timeout');
  assert.equal(row(2, 'vs Previous Build'), 'New');
  assert.equal(row(3, 'vs Previous Build'), 'Recurring');
  assert.deepEqual(row(2, 'Screenshot'), { text: 'View screenshot', hyperlink: 'http://jenkins/shot.png' });
  assert.equal(row(3, 'Screenshot'), '');
});

test('dashboard leads with feature file tiles and two chart images', async () => {
  const workbook = await buildFailureReportWorkbook({
    ...report,
    summary: {
      ...report.summary,
      reruns: { rerunScenarios: 2, totalAttempts: 5, firstRunFailed: 3, passedOnRerun: 1, stillFailing: 2 },
      features: { total: 4, passed: 2, failed: 2, rerun: 2, firstRunFailed: 3, passedOnRerun: 1 },
    },
  });
  assert.deepEqual(
    workbook.worksheets.map((s) => s.name),
    ['Dashboard', 'Failures', 'Root Causes', 'Failing Steps']
  );
  const dashboard = workbook.getWorksheet('Dashboard');
  assert.equal(dashboard.getImages().length, 2);
  assert.equal(dashboard.getCell('A6').value, 'FEATURE FILES');
  assert.equal(dashboard.getCell('A7').value, 4);
  assert.equal(dashboard.getCell('I6').value, 'FIXED BY RE-RUN');
  assert.equal(dashboard.getCell('I7').value, 1);
});

test('adds a failing steps sheet and leaves trend blank without a comparison', async () => {
  const workbook = await buildFailureReportWorkbook({ ...report, comparison: null });
  assert.equal(workbook.getWorksheet('Failing Steps').getRow(2).getCell(1).value, 'When I log in as "…"');
  const failures = workbook.getWorksheet('Failures');
  const trendCol = failures.getRow(1).values.indexOf('vs Previous Build');
  assert.equal(failures.getRow(2).getCell(trendCol).value, '');
});
