const express = require('express');
const config = require('../config/env');
const { parseBuildUrl } = require('../utils/urlParser');
const jenkinsClient = require('../services/jenkinsClient');
const { loadBuildFailures, siblingBuildUrl } = require('../services/reportLoader');
const { groupFailures } = require('../services/grouping');
const { categorizeGroups, summarizeFailingSteps, compareWithPrevious } = require('../services/insights');

const router = express.Router();

// Best effort: a missing or unreadable previous build must not fail the current analysis.
async function compareWithPreviousBuild(buildUrl, buildNumber, failures) {
  let previous;
  try {
    previous = await jenkinsClient.findPreviousComparableBuild(buildUrl, buildNumber, config.compareBuildParams);
  } catch (err) {
    return { previousBuildNumber: null, error: err.message };
  }
  if (!previous) return null;

  const base = { previousBuildNumber: previous.number, matchedOn: previous.matchedOn };
  try {
    const { failures: previousFailures } = await loadBuildFailures(siblingBuildUrl(buildUrl, previous.number));
    return { ...base, ...compareWithPrevious(failures, previousFailures) };
  } catch (err) {
    return { ...base, error: err.message };
  }
}

router.post('/analyze', async (req, res, next) => {
  try {
    const { buildUrl: pastedUrl } = req.body;
    const { buildUrl, jobName, buildNumber } = parseBuildUrl(pastedUrl);

    const { buildInfo, summary, failures } = await loadBuildFailures(buildUrl);
    const comparison = await compareWithPreviousBuild(buildUrl, buildNumber, failures);
    const groups = categorizeGroups(groupFailures(failures)).map((group) => ({
      ...group,
      newCount: group.failures.filter((f) => f.isNew).length,
    }));

    res.json({
      buildUrl,
      jobName,
      buildNumber,
      buildResult: buildInfo.result || null,
      summary,
      allPassed: failures.length === 0,
      comparison,
      failingSteps: summarizeFailingSteps(failures),
      groups,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
