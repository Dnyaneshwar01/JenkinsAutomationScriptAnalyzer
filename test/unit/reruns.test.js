const test = require('node:test');
const assert = require('node:assert/strict');
const { consolidateAttempts } = require('../../src/services/reruns');
const { extractScenarioAttempts } = require('../../src/services/cucumberParser');
const { extractAttemptsFromFeaturePage, parseFeatureTable } = require('../../src/services/htmlReportParser');

const attempt = (key, status, extra = {}) => ({
  key,
  status,
  feature: 'F',
  scenario: key,
  failedStep: status === 'passed' ? '' : `step of ${key}`,
  errorMessage: status === 'passed' ? '' : `error in ${key}`,
  tags: [],
  ...extra,
});

test('the last run of a scenario decides its final status', () => {
  const { failures, summary } = consolidateAttempts([
    attempt('flaky', 'failed'),
    attempt('stable', 'passed'),
    attempt('broken', 'failed', { errorMessage: 'first error' }),
    attempt('flaky', 'passed'),
    attempt('stable', 'passed'),
    attempt('broken', 'failed', { errorMessage: 'second error' }),
  ]);

  assert.deepEqual(failures.map((f) => f.scenario), ['broken']);
  const [broken] = failures;
  assert.equal(broken.runCount, 2);
  assert.equal(broken.errorMessage, 'second error');
  assert.deepEqual(broken.attempts.map((a) => a.status), ['failed', 'failed']);
  assert.equal(broken.attempts[0].errorMessage, 'first error');
  assert.equal('key' in broken, false);

  assert.deepEqual(summary, {
    total: 3,
    passed: 2,
    failed: 1,
    undefined: 0,
    pending: 0,
    reruns: { rerunScenarios: 3, totalAttempts: 6, firstRunFailed: 2, passedOnRerun: 1, stillFailing: 1 },
    features: { total: 1, passed: 0, failed: 1, rerun: 1, firstRunFailed: 1, passedOnRerun: 0 },
  });
});

test('builds without re-runs report one run per scenario', () => {
  const { failures, summary } = consolidateAttempts([attempt('a', 'passed'), attempt('b', 'undefined')], {
    scenarios: 5,
    features: 2,
  });
  assert.equal(failures[0].runCount, 1);
  assert.deepEqual(summary, {
    total: 7,
    passed: 6,
    failed: 0,
    undefined: 1,
    pending: 0,
    reruns: { rerunScenarios: 0, totalAttempts: 7, firstRunFailed: 1, passedOnRerun: 0, stillFailing: 1 },
    features: { total: 3, passed: 2, failed: 1, rerun: 0, firstRunFailed: 1, passedOnRerun: 0 },
  });
});

test('feature files fail a run if any of their scenarios fails it', () => {
  const inFeature = (feature) => (key, status) => attempt(`${feature}/${key}`, status, { feature });
  const fixed = inFeature('Fixed by re-run');
  const broken = inFeature('Still failing');
  const clean = inFeature('Clean');

  const { summary } = consolidateAttempts([
    fixed('a', 'failed'), fixed('b', 'passed'), fixed('a', 'passed'), fixed('b', 'passed'),
    broken('a', 'failed'), broken('b', 'passed'), broken('a', 'passed'), broken('b', 'failed'),
    clean('a', 'passed'),
  ]);

  assert.deepEqual(summary.features, { total: 3, passed: 2, failed: 1, rerun: 2, firstRunFailed: 2, passedOnRerun: 1 });
});

test('cucumber JSON: re-run copies of a scenario share a key, outline examples do not', () => {
  const step = (name, status) => ({ keyword: 'Given ', name, result: { status, error_message: status === 'failed' ? 'boom' : undefined } });
  const outline = (arg, status) => ({ type: 'scenario', name: 'Login', steps: [step(`I log in as "${arg}"`, status)] });
  const feature = (elements) => ({ uri: 'features/login.feature', name: 'Login', elements });

  // 1st run and a re-run of the failed example appended as a second feature entry
  const attempts = extractScenarioAttempts([
    feature([outline('amy', 'passed'), outline('bob', 'failed')]),
    feature([outline('bob', 'passed')]),
  ]);

  assert.deepEqual(attempts.map((a) => a.status), ['passed', 'failed', 'passed']);
  assert.notEqual(attempts[0].key, attempts[1].key);
  assert.equal(attempts[1].key, attempts[2].key);

  const { failures, summary } = consolidateAttempts(attempts);
  assert.equal(failures.length, 0);
  assert.equal(summary.total, 2);
  assert.equal(summary.reruns.passedOnRerun, 1);
});

// Trimmed-down markup in the shape of the Cucumber Reports plugin's report-feature_*.html,
// where a re-run of the feature is merged in after the 1st run.
function element(scenarioStatus, scenario, steps, errorText) {
  const stepsHtml = steps
    .map(
      ([status, name]) => `<div class="step"><div class="brief step-name-Given ${status}">
  <span class="keyword indention">Given</span>
  <span class="name">${name}</span>
  <span class="lead-duration duration">1.000</span>
</div>${status === 'failed' ? `<div class="inner-level"><div class="message indention"><pre>${errorText}</pre></div></div>` : ''}</div>`
    )
    .join('');
  return `<div class="element">
<div class="tags indention"><b>Tags:</b> <a href="t.html">@MarketPlace</a></div>
<div class="brief ${scenarioStatus}">
  <span class="keyword indention">Scenario Outline</span>
  <span class="name">${scenario}</span>
  <i class="chevron fa fa-fw"></i>
</div>
<div class="brief ${scenarioStatus}">
  <span class="keyword indention">Steps</span>
  <span class="name"></span>
</div>
${stepsHtml}
<div class="embeddings inner-level"><img src="embeddings/embedding_1.png"></div>
</div>`;
}

const featurePage = [
  element('failed', 'Create ITB', [['passed', 'I log in'], ['failed', 'I publish the ITB']], 'TimeoutException: first'),
  element('passed', 'Deactivate bid', [['passed', 'I log in'], ['passed', 'I deactivate']]),
  element('failed', 'Create ITB', [['passed', 'I log in'], ['failed', 'I publish the ITB']], 'TimeoutException: second'),
  element('passed', 'Deactivate bid', [['passed', 'I log in'], ['passed', 'I deactivate']]),
].join('\n');

test('HTML feature page: each element is one run, keyed by scenario and step text', () => {
  const reportUrl = 'http://jenkins/job/A/1/cucumber-html-reports/';
  const attempts = extractAttemptsFromFeaturePage(featurePage, 'MP - Pub ITB Flow', reportUrl);

  assert.deepEqual(attempts.map((a) => a.status), ['failed', 'passed', 'failed', 'passed']);
  assert.equal(attempts[0].key, attempts[2].key);
  assert.notEqual(attempts[0].key, attempts[1].key);
  assert.equal(attempts[0].feature, 'MP - Pub ITB Flow');
  assert.equal(attempts[0].failedStep, 'Given I publish the ITB');
  assert.deepEqual(attempts[2].screenshots, [`${reportUrl}embeddings/embedding_1.png`]);

  const { failures, summary } = consolidateAttempts(attempts);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].runCount, 2);
  assert.equal(failures[0].errorMessage, 'TimeoutException: second');
  assert.equal(summary.total, 2);
});

test('HTML features table rows give the page link and per-feature scenario counts', () => {
  const row = (href, name, passed, failed) => `<tr>
  <td class="tagname"><a href="${href}">${name}</a></td>
  <td class="passed">10</td><td>0</td><td>0</td><td>0</td><td>0</td><td class="total">10</td>
  <td class="passed">${passed}</td><td>${failed}</td><td class="total">${passed + failed}</td>
  <td class="duration">1:00</td><td class="passed">Passed</td>
</tr>`;
  const html = `<table id="build-info"></table><table id="tablesorter" class="stats-table"><tbody>
${row('report-feature_1_1.html', 'MP - Plant &amp; Transport', 1, 1)}
${row('report-feature_2_2.html', 'MP - Bids', 3, 0)}
</tbody><tfoot class="total"><tr><td></td></tr></tfoot></table>`;

  assert.deepEqual(parseFeatureTable(html), [
    { name: 'MP - Plant & Transport', href: 'report-feature_1_1.html', scenariosPassed: 1, scenariosFailed: 1, scenariosTotal: 2 },
    { name: 'MP - Bids', href: 'report-feature_2_2.html', scenariosPassed: 3, scenariosFailed: 0, scenariosTotal: 3 },
  ]);
  assert.deepEqual(parseFeatureTable('<html></html>'), []);
});
