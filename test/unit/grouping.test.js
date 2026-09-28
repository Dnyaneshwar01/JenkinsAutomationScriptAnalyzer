const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractFailures } = require('../../src/services/cucumberParser');
const { groupFailures } = require('../../src/services/grouping');

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-cucumber-report.json'), 'utf8')
);

test('merges failures with the same normalized signature into one group', () => {
  const groups = groupFailures(extractFailures(fixture));
  const timeoutGroup = groups.find((g) => g.exceptionType === 'org.openqa.selenium.TimeoutException');
  assert.ok(timeoutGroup);
  assert.equal(timeoutGroup.count, 2);
});

test('keeps distinct exceptions as separate groups', () => {
  const groups = groupFailures(extractFailures(fixture));
  const exceptionTypes = new Set(groups.map((g) => g.exceptionType));
  assert.ok(exceptionTypes.has('org.openqa.selenium.TimeoutException'));
  assert.ok(exceptionTypes.has('java.lang.AssertionError'));
});

test('sorts groups by failure count descending', () => {
  const groups = groupFailures(extractFailures(fixture));
  for (let i = 1; i < groups.length; i++) {
    assert.ok(groups[i - 1].count >= groups[i].count);
  }
});

test('undefined steps get their own dedicated group', () => {
  const groups = groupFailures(extractFailures(fixture));
  const undefinedGroup = groups.find((g) => g.groupId === 'UNDEFINED_STEP');
  assert.ok(undefinedGroup);
  assert.equal(undefinedGroup.count, 1);
});
