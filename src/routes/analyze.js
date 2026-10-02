const express = require('express');
const config = require('../config/env');
const { parseBuildUrl } = require('../utils/urlParser');
const jenkinsClient = require('../services/jenkinsClient');
const { loadBuildFailures, siblingBuildUrl } = require('../services/reportLoader');
const { groupFailures } = require('../services/grouping');
const { categorizeGroups, summarizeFailingSteps, compareWithPrevious } = require('../services/insights');

const { ValidationError } = require('../utils/errors');

const router = express.Router();

// The build URL's host decides which credentials are used; the selected platform must agree,
// so a QA build is never read as SB or the other way round.
function resolvePlatform(buildUrl, platformId) {
  const { host } = new URL(buildUrl);
  const owner = config.platformForHost(host);
  if (!platformId && !owner) throw new ValidationError(`Jenkins host "${host}" does not belong to any configured Jenkins platform.`);
  const selected = platformId ? config.platforms.find((p) => p.id === String(platformId).toUpperCase()) : owner;

  if (!selected) throw new ValidationError(`Unknown Jenkins platform "${platformId}".`);
  if (!selected.configured) throw new ValidationError(`Jenkins platform ${selected.label} is not set up: ${selected.problem}.`);
  if (!owner) {
    throw new ValidationError(`Jenkins host "${host}" is not in ${selected.hostsVar} (${selected.allowedHosts.join(', ')}) for ${selected.label}.`);
  }
  if (owner !== selected) {
    throw new ValidationError(`This build is on the ${owner.label} Jenkins (${host}), but ${selected.label} is selected. Select ${owner.label} or paste a ${selected.label} build URL.`);
  }
  return selected;
}

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
    const { buildUrl: pastedUrl, platform: platformId } = req.body;
    const { buildUrl, jobName, buildNumber } = parseBuildUrl(pastedUrl);
    const platform = resolvePlatform(buildUrl, platformId);

    const { buildInfo, summary, failures } = await loadBuildFailures(buildUrl);
    const comparison = await compareWithPreviousBuild(buildUrl, buildNumber, failures);
    const groups = categorizeGroups(groupFailures(failures)).map((group) => ({
      ...group,
      newCount: group.failures.filter((f) => f.isNew).length,
    }));

    res.json({
      buildUrl,
      platform: { id: platform.id, label: platform.label },
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
