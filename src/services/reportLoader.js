const jenkinsClient = require('./jenkinsClient');
const { extractScenarioAttempts } = require('./cucumberParser');
const {
  extractFailuresFromHtml,
  extractAttemptsFromFeaturePage,
  parseFeatureTable,
  getSummaryFromHtml,
} = require('./htmlReportParser');
const { consolidateAttempts } = require('./reruns');

const FEATURE_PAGE_CONCURRENCY = 6;

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Only features with a failed scenario can have been re-run, so only their pages are fetched;
// scenarios of the other features are counted from the features table.
async function loadHtmlResults({ reportUrl, featuresHtml }) {
  const features = parseFeatureTable(featuresHtml);
  if (features.length === 0) {
    // Unrecognised features table: fall back to the failures page, without re-run handling.
    const failuresHtml = await jenkinsClient.fetchReportPage(reportUrl, 'overview-failures.html');
    const failures = extractFailuresFromHtml(failuresHtml, reportUrl);
    return { summary: getSummaryFromHtml(featuresHtml, failures), failures };
  }

  const failing = features.filter((f) => f.scenariosFailed > 0 && f.href);
  const passing = features.filter((f) => !failing.includes(f));
  const passedElsewhere = { features: passing.length, scenarios: passing.reduce((sum, f) => sum + f.scenariosTotal, 0) };

  const attemptsPerFeature = await mapWithConcurrency(failing, FEATURE_PAGE_CONCURRENCY, async (feature) =>
    extractAttemptsFromFeaturePage(await jenkinsClient.fetchReportPage(reportUrl, feature.href), feature.name, reportUrl)
  );
  return consolidateAttempts(attemptsPerFeature.flat(), passedElsewhere);
}

// Fetches a build's Cucumber results (JSON artifact or Cucumber Reports HTML) as { buildInfo, summary, failures }.
// Scenarios re-run within the build are collapsed to their final attempt; see reruns.js.
async function loadBuildFailures(buildUrl) {
  const report = await jenkinsClient.analyzeBuild(buildUrl);

  const { summary, failures } =
    report.source === 'html' ? await loadHtmlResults(report) : consolidateAttempts(extractScenarioAttempts(report.cucumberJson));
  return { buildInfo: report.buildInfo, summary, failures };
}

// Same job, different build number: .../job/X/2880/ -> .../job/X/2879/
function siblingBuildUrl(buildUrl, buildNumber) {
  return buildUrl.replace(/\d+\/$/, `${buildNumber}/`);
}

module.exports = { loadBuildFailures, siblingBuildUrl };
