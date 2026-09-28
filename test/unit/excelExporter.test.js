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

test('adds a failing steps sheet and leaves trend blank without a comparison', async () => {
  const workbook = await buildFailureReportWorkbook({ ...report, comparison: null });
  assert.equal(workbook.getWorksheet('Failing Steps').getRow(2).getCell(1).value, 'When I log in as "…"');
  const failures = workbook.getWorksheet('Failures');
  const trendCol = failures.getRow(1).values.indexOf('vs Previous Build');
  assert.equal(failures.getRow(2).getCell(trendCol).value, '');
});
