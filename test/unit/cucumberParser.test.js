const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractFailures, getSummaryCounts } = require('../../src/services/cucumberParser');

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-cucumber-report.json'), 'utf8')
);
const allPassedFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-cucumber-report-all-passed.json'), 'utf8')
);

test('extracts failed, undefined, and hook-failed scenarios', () => {
  const failures = extractFailures(fixture);
  // 2 timeout failures + 1 assertion failure + 1 undefined step + 1 before-hook failure = 5
  assert.equal(failures.length, 5);
});

test('detects a @Before hook failure via the before[] array, not steps[]', () => {
  const failures = extractFailures(fixture);
  const hookFailure = failures.find((f) => f.scenario === 'Session expires after timeout');
  assert.ok(hookFailure, 'expected to find the hook-failure scenario');
  assert.equal(hookFailure.failedStep, 'Before Hook');
  assert.match(hookFailure.errorMessage, /RuntimeException/);
});

test('buckets undefined steps separately with status "undefined"', () => {
  const failures = extractFailures(fixture);
  const undefinedFailure = failures.find((f) => f.scenario === 'Password reset sends email');
  assert.ok(undefinedFailure);
  assert.equal(undefinedFailure.status, 'undefined');
});

test('summary counts match the fixture composition', () => {
  const summary = getSummaryCounts(fixture);
  assert.deepEqual(summary, { total: 6, passed: 1, failed: 4, undefined: 1, pending: 0 });
});

test('all-passed fixture reports zero failures', () => {
  const failures = extractFailures(allPassedFixture);
  const summary = getSummaryCounts(allPassedFixture);
  assert.equal(failures.length, 0);
  assert.equal(summary.passed, summary.total);
});
