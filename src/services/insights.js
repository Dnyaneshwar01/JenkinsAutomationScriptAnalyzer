// Triage helpers layered on top of grouped failures: root-cause category, most common
// failing steps, and new-vs-recurring comparison with a previous build.

// Checked in order; the first matching rule wins.
const CATEGORY_RULES = [
  {
    category: 'Infrastructure',
    test: (f) =>
      /WebDriverException|SessionNotCreated|NoSuchSession|chrome not reachable|session deleted|disconnected: |unable to connect|Connection refused|ECONNREFUSED|UnreachableBrowser|OutOfMemory|Could not start a new session/i.test(
        f.errorMessage
      ),
  },
  { category: 'Hook / Setup', test: (f) => /Hook$/.test(f.failedStep) },
  { category: 'Assertion', test: (f) => /AssertionError|AssertionFailedError|ComparisonFailure|expected .* but (was|found)/i.test(f.errorMessage) },
  {
    category: 'Application / API',
    test: (f) => /\b(HTTP|status code|response code)[\s:]*[45]\d\d\b|Internal Server Error|Bad Gateway|Service Unavailable/i.test(f.errorMessage),
  },
  {
    category: 'Locator / Wait',
    test: (f) =>
      /NoSuchElement|StaleElementReference|ElementNotInteractable|ElementClickIntercepted|ElementNotVisible|By\.(cssSelector|xpath|id|name|className|linkText|tagName)|(in)?visibility of/i.test(
        f.errorMessage
      ),
  },
  { category: 'Timeout', test: (f) => /Timeout|TimedOut|timed out/i.test(f.errorMessage) },
];

function categorizeFailure(failure) {
  if (failure.status === 'undefined' || failure.status === 'pending') return 'Not implemented';
  const rule = CATEGORY_RULES.find((r) => r.test({ errorMessage: failure.errorMessage || '', failedStep: failure.failedStep || '' }));
  return rule ? rule.category : 'Other';
}

// Group members share a normalized error, so the first failure is representative.
function categorizeGroups(groups) {
  return groups.map((group) => ({ ...group, category: categorizeFailure(group.failures[0] || {}) }));
}

// Drop the Gherkin keyword and mask arguments so 'And I log in as "bob"' and
// 'When I log in as "amy"' count as the same step.
function stepTemplate(failedStep) {
  return (failedStep || '')
    .replace(/^(Given|When|Then|And|But|\*)\s+/, '')
    .replace(/"[^"]*"/g, '"…"')
    .replace(/<[^>]*>/g, '<…>');
}

// Each entry also lists the feature files the step failed in, so it can be traced back.
function summarizeFailingSteps(failures, limit = 10) {
  const byStep = new Map();
  for (const failure of failures) {
    const step = stepTemplate(failure.failedStep);
    if (!byStep.has(step)) byStep.set(step, { count: 0, features: new Set() });
    const entry = byStep.get(step);
    entry.count += 1;
    entry.features.add(failure.feature);
  }
  return Array.from(byStep, ([step, { count, features }]) => ({
    step,
    count,
    percent: failures.length ? Math.round((count / failures.length) * 100) : 0,
    features: [...features].sort(),
  }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

const scenarioKey = (f) => `${f.feature}\u0000${f.scenario}`;

// Marks each current failure with isNew and returns counts relative to the previous build.
function compareWithPrevious(currentFailures, previousFailures) {
  const previousKeys = new Set(previousFailures.map(scenarioKey));
  const currentKeys = new Set(currentFailures.map(scenarioKey));

  for (const failure of currentFailures) {
    failure.isNew = !previousKeys.has(scenarioKey(failure));
  }

  const newCount = currentFailures.filter((f) => f.isNew).length;
  return {
    newCount,
    recurringCount: currentFailures.length - newCount,
    fixedCount: [...previousKeys].filter((k) => !currentKeys.has(k)).length,
  };
}

module.exports = { categorizeFailure, categorizeGroups, summarizeFailingSteps, compareWithPrevious, stepTemplate };
