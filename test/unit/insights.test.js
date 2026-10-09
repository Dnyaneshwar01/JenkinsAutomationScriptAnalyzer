const test = require('node:test');
const assert = require('node:assert/strict');
const { categorizeFailure, summarizeFailingSteps, compareWithPrevious, stepTemplate } = require('../../src/services/insights');

const failure = (overrides) => ({ feature: 'F', scenario: 'S', failedStep: 'When I click', errorMessage: '', status: 'failed', ...overrides });

test('categorizes common Selenium / Cucumber failure types', () => {
  const cases = [
    ["x.AutomationErrors: ERROR: Timeout after 120s for invisibility of By.cssSelector: div[class*='x']", 'Locator / Wait'],
    ['org.openqa.selenium.NoSuchElementException: no such element', 'Locator / Wait'],
    ['java.lang.AssertionError\n\tat org.junit.Assert.fail(Assert.java:87)', 'Assertion'],
    ['org.openqa.selenium.WebDriverException: chrome not reachable', 'Infrastructure'],
    ['java.lang.RuntimeException: API returned status code 503', 'Application / API'],
    ['org.openqa.selenium.TimeoutException: page load timed out', 'Timeout'],
    ['java.lang.NullPointerException', 'Other'],
  ];
  for (const [errorMessage, expected] of cases) {
    assert.equal(categorizeFailure(failure({ errorMessage })), expected, errorMessage);
  }
});

test('hook failures and unimplemented steps get their own categories', () => {
  assert.equal(categorizeFailure(failure({ failedStep: 'Before Hook', errorMessage: 'boom' })), 'Hook / Setup');
  assert.equal(categorizeFailure(failure({ status: 'undefined' })), 'Not implemented');
  // An infrastructure error inside a hook is still infrastructure.
  assert.equal(categorizeFailure(failure({ failedStep: 'Before Hook', errorMessage: 'SessionNotCreatedException' })), 'Infrastructure');
});

test('failing steps are counted ignoring the Gherkin keyword and quoted arguments', () => {
  assert.equal(stepTemplate('And I log in as "bob" user'), 'I log in as "…" user');
  assert.equal(stepTemplate('Before Hook'), 'Before Hook');
  const steps = summarizeFailingSteps([
    failure({ feature: 'MP - STD PQQ Flow', failedStep: 'And I log in as "bob" user' }),
    failure({ feature: 'MP - Bids', failedStep: 'When I log in as "amy" user' }),
    failure({ failedStep: 'Then I see "x"' }),
  ]);
  assert.deepEqual(steps, [
    { step: 'I log in as "…" user', count: 2, percent: 67, features: ['MP - Bids', 'MP - STD PQQ Flow'] },
    { step: 'I see "…"', count: 1, percent: 33, features: ['F'] },
  ]);
});

test('lists every distinct failing step, not just the top 10', () => {
  const failures = Array.from({ length: 15 }, (_, i) => failure({ failedStep: `When I do step ${i}` }));
  assert.equal(summarizeFailingSteps(failures).length, 15);
});

test('compares with the previous build by feature + scenario', () => {
  const current = [failure({ scenario: 'A' }), failure({ scenario: 'B' })];
  const previous = [failure({ scenario: 'B' }), failure({ scenario: 'C' })];
  assert.deepEqual(compareWithPrevious(current, previous), { newCount: 1, recurringCount: 1, fixedCount: 1 });
  assert.equal(current[0].isNew, true);
  assert.equal(current[1].isNew, false);
});
