// Fast, no-HTTP iteration on parsing/normalization/grouping logic against a local fixture.
// Run with: npm run run-fixture

const fs = require('fs');
const path = require('path');
const { extractFailures, getSummaryCounts } = require('../src/services/cucumberParser');
const { groupFailures } = require('../src/services/grouping');

const fixturePath = path.join(__dirname, 'fixtures', 'sample-cucumber-report.json');
const cucumberJson = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const summary = getSummaryCounts(cucumberJson);
const failures = extractFailures(cucumberJson);
const groups = groupFailures(failures);

console.log('Summary:', summary);
console.log(`\n${groups.length} failure group(s):\n`);

for (const group of groups) {
  console.log(`- [${group.exceptionType || 'Unknown'}] ${group.sampleMessage} (${group.count})`);
  for (const f of group.failures) {
    console.log(`    ${f.feature} > ${f.scenario} > ${f.failedStep}`);
  }
}
