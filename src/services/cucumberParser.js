const SCENARIO_TYPES = new Set(['scenario', 'scenario outline']);

function findFailedHook(hooks) {
  return (hooks || []).find((h) => h.result && h.result.status === 'failed');
}

function extractTags(element, feature) {
  const tags = [...(feature.tags || []), ...(element.tags || [])];
  return tags.map((t) => t.name).filter(Boolean);
}

// Returns null if the scenario passed, otherwise { failedStep, errorMessage, status }
function findScenarioFailure(element) {
  const failedBefore = findFailedHook(element.before);
  if (failedBefore) {
    return {
      failedStep: 'Before Hook',
      errorMessage: failedBefore.result.error_message || '',
      status: 'failed',
    };
  }

  for (const step of element.steps || []) {
    const status = step.result && step.result.status;
    if (!status || status === 'passed') continue;

    if (status === 'failed') {
      return {
        failedStep: step.name || '(unnamed step)',
        errorMessage: (step.result && step.result.error_message) || '',
        status: 'failed',
      };
    }

    if (status === 'undefined') {
      return { failedStep: step.name || '(unnamed step)', errorMessage: '', status: 'undefined' };
    }

    if (status === 'pending') {
      return { failedStep: step.name || '(unnamed step)', errorMessage: '', status: 'pending' };
    }

    // 'skipped' can appear after an earlier failure/undefined step in the same scenario;
    // keep scanning in case an actual failure appears, otherwise it's a hook-driven skip.
  }

  const failedAfter = findFailedHook(element.after);
  if (failedAfter) {
    return {
      failedStep: 'After Hook',
      errorMessage: failedAfter.result.error_message || '',
      status: 'failed',
    };
  }

  return null;
}

function extractFailures(cucumberJson) {
  const failures = [];

  for (const feature of cucumberJson || []) {
    for (const element of feature.elements || []) {
      if (!SCENARIO_TYPES.has(element.type)) continue;

      const failure = findScenarioFailure(element);
      if (!failure) continue;

      failures.push({
        feature: feature.name || '(unnamed feature)',
        scenario: element.name || '(unnamed scenario)',
        failedStep: failure.failedStep,
        errorMessage: failure.errorMessage,
        status: failure.status,
        tags: extractTags(element, feature),
      });
    }
  }

  return failures;
}

// Every scenario run in report order, passed ones included, for re-run consolidation.
// Re-runs of a scenario share its feature, name and step text; outline examples differ in step text.
function extractScenarioAttempts(cucumberJson) {
  const attempts = [];

  for (const feature of cucumberJson || []) {
    const featureName = feature.name || '(unnamed feature)';
    for (const element of feature.elements || []) {
      if (!SCENARIO_TYPES.has(element.type)) continue;

      const scenario = element.name || '(unnamed scenario)';
      const steps = (element.steps || []).map((s) => `${s.keyword || ''}${s.name || ''}`).join('\n');
      const failure = findScenarioFailure(element);
      attempts.push({
        key: [feature.uri || featureName, scenario, steps].join('\u0000'),
        feature: featureName,
        scenario,
        failedStep: failure ? failure.failedStep : '',
        errorMessage: failure ? failure.errorMessage : '',
        status: failure ? failure.status : 'passed',
        tags: extractTags(element, feature),
      });
    }
  }

  return attempts;
}

function getSummaryCounts(cucumberJson) {
  const counts = { total: 0, passed: 0, failed: 0, undefined: 0, pending: 0 };

  for (const feature of cucumberJson || []) {
    for (const element of feature.elements || []) {
      if (!SCENARIO_TYPES.has(element.type)) continue;
      counts.total += 1;

      const failure = findScenarioFailure(element);
      if (!failure) {
        counts.passed += 1;
      } else if (failure.status === 'undefined') {
        counts.undefined += 1;
      } else if (failure.status === 'pending') {
        counts.pending += 1;
      } else {
        counts.failed += 1;
      }
    }
  }

  return counts;
}

module.exports = { extractFailures, extractScenarioAttempts, getSummaryCounts };
