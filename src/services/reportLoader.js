const jenkinsClient = require('./jenkinsClient');
const { extractFailures, getSummaryCounts } = require('./cucumberParser');
const { extractFailuresFromHtml, getSummaryFromHtml } = require('./htmlReportParser');

// Fetches a build's Cucumber results (JSON artifact or Cucumber Reports HTML) as { buildInfo, summary, failures }.
async function loadBuildFailures(buildUrl) {
  const report = await jenkinsClient.analyzeBuild(buildUrl);

  if (report.source === 'html') {
    const failures = extractFailuresFromHtml(report.failuresHtml, report.reportUrl);
    return { buildInfo: report.buildInfo, summary: getSummaryFromHtml(report.featuresHtml, failures), failures };
  }

  return {
    buildInfo: report.buildInfo,
    summary: getSummaryCounts(report.cucumberJson),
    failures: extractFailures(report.cucumberJson),
  };
}

// Same job, different build number: .../job/X/2880/ -> .../job/X/2879/
function siblingBuildUrl(buildUrl, buildNumber) {
  return buildUrl.replace(/\d+\/$/, `${buildNumber}/`);
}

module.exports = { loadBuildFailures, siblingBuildUrl };
