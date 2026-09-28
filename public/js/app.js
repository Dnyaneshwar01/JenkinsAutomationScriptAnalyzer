const buildUrlInput = document.getElementById('build-url-input');
const analyzeBtn = document.getElementById('analyze-btn');
const statusArea = document.getElementById('status-area');
const summaryBar = document.getElementById('summary-bar');
const insightsArea = document.getElementById('insights-area');
const filterBar = document.getElementById('filter-bar');
const filterInput = document.getElementById('filter-input');
const newOnlyLabel = document.getElementById('new-only-label');
const newOnlyToggle = document.getElementById('new-only-toggle');
const expandAllBtn = document.getElementById('expand-all-btn');
const filterCount = document.getElementById('filter-count');
const reportArea = document.getElementById('report-area');
const downloadBtn = document.getElementById('download-excel-btn');

let lastReport = null;

function showStatus(message, type) {
  statusArea.hidden = false;
  statusArea.className = `status-area ${type}`;
  statusArea.textContent = message;
}

function hideStatus() {
  statusArea.hidden = true;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function hasComparison(report) {
  return Boolean(report.comparison && !report.comparison.error);
}

function renderScreenshots(screenshots) {
  if (!screenshots || screenshots.length === 0) {
    return '<div class="screenshots none">No screenshot</div>';
  }
  const thumbs = screenshots
    .map((url) => {
      const src = `/api/screenshot?url=${encodeURIComponent(url)}`;
      return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener" title="Open full screenshot"><img loading="lazy" src="${escapeHtml(src)}" alt="Failure screenshot"></a>`;
    })
    .join('');
  return `<div class="screenshots">${thumbs}</div>`;
}

function renderSummary(report) {
  const { summary, comparison } = report;
  summaryBar.hidden = false;
  const passRate = summary.total ? `${Math.round((summary.passed / summary.total) * 100)}%` : '–';
  const stats = [
    ['Total', summary.total],
    ['Passed', summary.passed, 'passed'],
    ['Failed', summary.failed, 'failed'],
    ['Undefined', summary.undefined],
    ['Pending', summary.pending],
    ['Pass rate', passRate],
  ];
  if (hasComparison(report)) {
    stats.push(
      [`New vs #${comparison.previousBuildNumber}`, comparison.newCount, 'failed'],
      ['Recurring', comparison.recurringCount],
      ['Fixed', comparison.fixedCount, 'passed']
    );
  }
  summaryBar.innerHTML = stats
    .map(([label, value, tone]) => `<div class="summary-stat ${tone || ''}"><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</div>`)
    .join('');
}

function renderInsights(report) {
  const steps = report.failingSteps || [];
  const { comparison } = report;
  const notes = [];
  if (comparison && comparison.error) {
    const target = comparison.previousBuildNumber ? `build #${comparison.previousBuildNumber}` : 'a previous build';
    notes.push(`Could not compare with ${target}: ${comparison.error}`);
  } else if (comparison) {
    const params = (comparison.matchedOn || []).map((p) => `${p.name}=${p.value}`).join(', ');
    notes.push(`New / recurring / fixed are relative to build #${comparison.previousBuildNumber}${params ? `, the latest earlier build with the same ${params}` : ''}.`);
  } else {
    notes.push('No earlier comparable build found, so failures are not marked as new or recurring.');
  }

  if (report.allPassed || (steps.length === 0 && notes.length === 0)) {
    insightsArea.hidden = true;
    return;
  }

  const top = steps[0];
  const headline =
    top && top.percent >= 40 && top.count >= 3
      ? `<p class="insight-headline">${top.percent}% of failures (${top.count}) stop at the same step — likely one blocking issue rather than ${top.count} separate bugs.</p>`
      : '';

  insightsArea.hidden = false;
  insightsArea.innerHTML = `
    <h2>Most common failing steps</h2>
    ${headline}
    <ol class="step-list">
      ${steps
        .map(
          (s) => `<li>
            <div class="step-bar" style="width:${s.percent}%"></div>
            <span class="step-text">${escapeHtml(s.step)}</span>
            <span class="step-count">${s.count} · ${s.percent}%</span>
          </li>`
        )
        .join('')}
    </ol>
    ${notes.map((n) => `<p class="insight-note">${escapeHtml(n)}</p>`).join('')}
  `;
}

function failureSearchText(f) {
  return [f.feature, f.scenario, f.failedStep, f.errorMessage, ...(f.tags || [])].join('\n').toLowerCase();
}

function renderReport(report) {
  reportArea.innerHTML = '';

  if (report.allPassed) {
    reportArea.innerHTML = `<div class="all-passed">All scenarios passed for ${escapeHtml(report.jobName)} #${escapeHtml(report.buildNumber)}.</div>`;
    downloadBtn.hidden = true;
    filterBar.hidden = true;
    return;
  }

  const showTrend = hasComparison(report);

  for (const group of report.groups) {
    const card = document.createElement('div');
    card.className = 'group-card';

    const categoryBadge = group.category ? `<span class="group-category">${escapeHtml(group.category)}</span>` : '';
    const exceptionBadge = group.exceptionType ? `<span class="group-exception">${escapeHtml(group.exceptionType)}</span>` : '';
    const newBadge = showTrend && group.newCount > 0 ? `<span class="badge-new">${group.newCount} new</span>` : '';

    card.innerHTML = `
      <div class="group-header">
        <div class="group-title">${categoryBadge}${exceptionBadge}${escapeHtml(group.sampleMessage)}</div>
        <div class="group-count">${newBadge}<span class="count-text">${group.count} failure${group.count === 1 ? '' : 's'}</span></div>
      </div>
      <div class="group-body">
        ${group.failures
          .map(
            (f) => `
          <div class="failure-row" data-new="${f.isNew ? '1' : '0'}" data-search="${escapeHtml(failureSearchText(f))}">
            <div class="failure-details">
              <div class="feature-scenario">${showTrend && f.isNew ? '<span class="badge-new">NEW</span>' : ''}<strong>${escapeHtml(f.feature)}</strong> &rsaquo; ${escapeHtml(f.scenario)}</div>
              <div>Failed step: ${escapeHtml(f.failedStep)}</div>
              ${f.tags && f.tags.length ? `<div class="tags">${f.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
              <pre>${escapeHtml(f.errorMessage || '(no error message)')}</pre>
            </div>
            ${renderScreenshots(f.screenshots)}
          </div>`
          )
          .join('')}
      </div>
    `;

    const header = card.querySelector('.group-header');
    const body = card.querySelector('.group-body');
    header.addEventListener('click', () => body.classList.toggle('open'));

    reportArea.appendChild(card);
  }

  filterInput.value = '';
  newOnlyToggle.checked = false;
  newOnlyLabel.hidden = !showTrend;
  filterBar.hidden = false;
  applyFilters();
  downloadBtn.hidden = false;
}

function applyFilters() {
  const terms = filterInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const newOnly = newOnlyToggle.checked;
  const filtering = terms.length > 0 || newOnly;
  let visible = 0;
  let total = 0;

  for (const card of reportArea.querySelectorAll('.group-card')) {
    let cardVisible = 0;
    for (const row of card.querySelectorAll('.failure-row')) {
      total += 1;
      const matches = (!newOnly || row.dataset.new === '1') && terms.every((t) => row.dataset.search.includes(t));
      row.hidden = !matches;
      if (matches) cardVisible += 1;
    }
    visible += cardVisible;
    card.hidden = cardVisible === 0;
    const countText = card.querySelector('.count-text');
    const count = card.querySelectorAll('.failure-row').length;
    countText.textContent = filtering ? `${cardVisible} of ${count} shown` : `${count} failure${count === 1 ? '' : 's'}`;
    if (filtering && cardVisible > 0) card.querySelector('.group-body').classList.add('open');
  }

  filterCount.textContent = filtering ? `${visible} of ${total} failures` : '';
}

function toggleAllGroups() {
  const bodies = [...reportArea.querySelectorAll('.group-card:not([hidden]) .group-body')];
  const expand = bodies.some((b) => !b.classList.contains('open'));
  bodies.forEach((b) => b.classList.toggle('open', expand));
  expandAllBtn.textContent = expand ? 'Collapse all' : 'Expand all';
}

async function analyze() {
  const buildUrl = buildUrlInput.value.trim();
  if (!buildUrl) {
    showStatus('Please paste a Jenkins build URL first.', 'error');
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';
  showStatus('Fetching and analyzing the build report (and the previous build for comparison)...', 'info');
  summaryBar.hidden = true;
  insightsArea.hidden = true;
  filterBar.hidden = true;
  reportArea.innerHTML = '';
  downloadBtn.hidden = true;
  expandAllBtn.textContent = 'Expand all';

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buildUrl }),
    });

    const data = await res.json();

    if (!res.ok) {
      showStatus(data.error || `Request failed with status ${res.status}.`, 'error');
      return;
    }

    lastReport = data;
    hideStatus();
    renderSummary(data);
    renderInsights(data);
    renderReport(data);
  } catch (err) {
    showStatus(`Unexpected error: ${err.message}`, 'error');
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze';
  }
}

async function downloadExcel() {
  if (!lastReport) return;

  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Preparing file...';

  try {
    const res = await fetch('/api/export/excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastReport),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showStatus(data.error || 'Failed to generate Excel report.', 'error');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cucumber-failure-report-${lastReport.jobName}-${lastReport.buildNumber}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showStatus(`Unexpected error while exporting: ${err.message}`, 'error');
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download Excel Report';
  }
}

analyzeBtn.addEventListener('click', analyze);
buildUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') analyze();
});
filterInput.addEventListener('input', applyFilters);
newOnlyToggle.addEventListener('change', applyFilters);
expandAllBtn.addEventListener('click', toggleAllGroups);
downloadBtn.addEventListener('click', downloadExcel);
