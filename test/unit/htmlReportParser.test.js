const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFailuresFromHtml, getSummaryFromHtml } = require('../../src/services/htmlReportParser');

// Trimmed-down markup in the shape produced by the Jenkins Cucumber Reports plugin.
function brief(status, keyword, name, cls = 'name') {
  return `<div class="brief ${status}">
  <span class="keyword indention">${keyword}</span>
  <span class="${cls}">${name}</span>
  <span class="lead-duration duration">1.000</span>
</div>`;
}

const message = (text) => `<div class="inner-level"><div class="message indention">
  <div id="msg-1" class="collapse collapsable-details  in "><pre>${text}</pre></div></div></div>`;

const failuresHtml = `<h2>Failures Overview</h2><div class="elements">
<div class="element">
  <div class="indention"><b>Feature:</b> <a href="f1.html">Login &amp; Setup</a></div>
  <div class="tags indention"><b>Tags:</b> <a href="t.html">@MarketPlace</a> <a href="t2.html">@Smoke</a></div>
  ${brief('failed', 'Scenario Outline', 'User logs in')}
  ${brief('passed', 'Hooks', '')}
  <div class="hook">${brief('passed', 'Before', 'Setup.init()', 'location name')}</div>
  ${brief('failed', 'Steps', '')}
  <div class="step">${brief('step-name-Given passed', 'Given', 'I open the app')}</div>
  <div class="step">${brief('step-name-And failed', 'And', 'I log in as <span class="argument">&quot;bob&quot;</span>')}
  ${message('org.x.AutomationErrors: By.cssSelector: div[id=&#39;login&#39;]\n\tat Page.java:10')}</div>
  <div class="step">${brief('step-name-Then skipped', 'Then', 'I see the dashboard')}</div>
  <div class="embeddings inner-level"><div class="embedding-content"><img src="embeddings/embedding_-123.png"></div></div>
</div>
<div class="element">
  <div class="indention"><b>Feature:</b> <a href="f2.html">Bids</a></div>
  ${brief('failed', 'Scenario', 'Create bid')}
  ${brief('failed', 'Hooks', '')}
  <div class="hook">${brief('failed', 'Before', 'Setup.init()', 'location name')}
  ${message('java.lang.IllegalStateException: no browser')}</div>
  <div class="step">${brief('step-name-Given skipped', 'Given', 'I open bids')}</div>
</div>
<div class="element">
  <div class="indention"><b>Feature:</b> <a href="f3.html">Search</a></div>
  ${brief('failed', 'Scenario', 'Search org')}
  <div class="step">${brief('step-name-When undefined', 'When', 'I search magically')}</div>
</div>
</div>`;

const featuresHtml = `<table><tfoot class="total"><tr>
  <td></td><td>10</td><td>3</td><td>5</td><td>0</td><td>1</td><td>19</td>
  <td>7</td><td>3</td><td>10</td><td class="duration">1:00</td><td>2</td>
</tr><tr><td></td><td>50%</td></tr></tfoot></table>`;

test('extracts one failure per failed scenario with feature, tags, step and decoded error', () => {
  const failures = extractFailuresFromHtml(failuresHtml);
  assert.equal(failures.length, 3);
  assert.deepEqual(failures[0], {
    feature: 'Login & Setup',
    scenario: 'User logs in',
    failedStep: 'And I log in as "bob"',
    errorMessage: "org.x.AutomationErrors: By.cssSelector: div[id='login']\n\tat Page.java:10",
    status: 'failed',
    tags: ['@MarketPlace', '@Smoke'],
    screenshots: ['embeddings/embedding_-123.png'],
  });
});

test('resolves screenshot links against the report URL', () => {
  const reportUrl = 'http://jenkins:8080/job/A/5/cucumber-html-reports/';
  const [withShot, withoutShot] = extractFailuresFromHtml(failuresHtml, reportUrl);
  assert.deepEqual(withShot.screenshots, [`${reportUrl}embeddings/embedding_-123.png`]);
  assert.deepEqual(withoutShot.screenshots, []);
});

test('reports a failed hook as the failing step', () => {
  const [, hookFailure] = extractFailuresFromHtml(failuresHtml);
  assert.equal(hookFailure.failedStep, 'Before Hook');
  assert.equal(hookFailure.errorMessage, 'java.lang.IllegalStateException: no browser');
  assert.deepEqual(hookFailure.tags, []);
});

test('reports undefined steps with their status and no error message', () => {
  const [, , undefinedFailure] = extractFailuresFromHtml(failuresHtml);
  assert.equal(undefinedFailure.status, 'undefined');
  assert.equal(undefinedFailure.failedStep, 'When I search magically');
  assert.equal(undefinedFailure.errorMessage, '');
});

test('reads scenario totals from the features overview footer', () => {
  const failures = extractFailuresFromHtml(failuresHtml);
  assert.deepEqual(getSummaryFromHtml(featuresHtml, failures), {
    total: 10,
    passed: 7,
    failed: 2,
    undefined: 1,
    pending: 0,
  });
});

test('rejects pages that are not a Cucumber failures overview', () => {
  assert.throws(() => extractFailuresFromHtml('<html>Login</html>'), { code: 'MALFORMED_REPORT' });
  assert.throws(() => getSummaryFromHtml('<html></html>', []), { code: 'MALFORMED_REPORT' });
});
