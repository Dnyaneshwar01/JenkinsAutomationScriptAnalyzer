// Collapses re-run attempts of the same scenario within one build into a single result.
// Nightly jobs re-run failed feature files inside the same build, so a scenario can appear several
// times in the report; the last attempt decides its final status.

// A feature file fails a run if any of its scenarios fails that run.
function summarizeFeatures(scenarioResults, extraPassedFeatures) {
  const byFeature = new Map();
  for (const result of scenarioResults) {
    if (!byFeature.has(result.feature)) byFeature.set(result.feature, []);
    byFeature.get(result.feature).push(result);
  }

  const features = {
    total: extraPassedFeatures,
    passed: extraPassedFeatures,
    failed: 0,
    rerun: 0,
    firstRunFailed: 0,
    passedOnRerun: 0,
  };
  for (const results of byFeature.values()) {
    const firstFailed = results.some((r) => r.firstStatus !== 'passed');
    const finalFailed = results.some((r) => r.finalStatus !== 'passed');
    features.total += 1;
    features[finalFailed ? 'failed' : 'passed'] += 1;
    if (results.some((r) => r.runCount > 1)) features.rerun += 1;
    if (firstFailed) features.firstRunFailed += 1;
    if (firstFailed && !finalFailed) features.passedOnRerun += 1;
  }
  return features;
}

// attempts: in execution order, each { key, status, feature, scenario, failedStep, errorMessage, tags, screenshots }
// where status is 'passed', 'failed', 'undefined' or 'pending'.
// extraPassed: { scenarios, features } known to have passed first time that are not in `attempts`
// (e.g. features whose report page was not fetched because nothing in them failed).
function consolidateAttempts(attempts, extraPassed = {}) {
  const extraScenarios = extraPassed.scenarios || 0;
  const byKey = new Map();
  for (const attempt of attempts) {
    if (!byKey.has(attempt.key)) byKey.set(attempt.key, []);
    byKey.get(attempt.key).push(attempt);
  }

  const failures = [];
  const scenarioResults = [];
  const summary = { total: extraScenarios, passed: extraScenarios, failed: 0, undefined: 0, pending: 0 };
  const reruns = { rerunScenarios: 0, totalAttempts: extraScenarios, firstRunFailed: 0, passedOnRerun: 0, stillFailing: 0 };

  for (const runs of byKey.values()) {
    const first = runs[0];
    const final = runs[runs.length - 1];
    scenarioResults.push({ feature: final.feature, firstStatus: first.status, finalStatus: final.status, runCount: runs.length });

    summary.total += 1;
    summary[final.status] += 1;
    reruns.totalAttempts += runs.length;
    if (runs.length > 1) reruns.rerunScenarios += 1;
    if (first.status !== 'passed') reruns.firstRunFailed += 1;
    if (first.status !== 'passed' && final.status === 'passed') reruns.passedOnRerun += 1;
    if (final.status === 'passed') continue;

    reruns.stillFailing += 1;
    const { key, ...failure } = final;
    failures.push({
      ...failure,
      runCount: runs.length,
      attempts: runs.map((r) => ({ status: r.status, failedStep: r.failedStep || '', errorMessage: r.errorMessage || '' })),
    });
  }

  const features = summarizeFeatures(scenarioResults, extraPassed.features || 0);
  return { failures, summary: { ...summary, reruns, features } };
}

module.exports = { consolidateAttempts };
