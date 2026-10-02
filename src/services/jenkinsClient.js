const axios = require('axios');
const config = require('../config/env');
const {
  AppError,
  ValidationError,
  JenkinsAuthError,
  JenkinsNotFoundError,
  ArtifactNotFoundError,
  BuildInProgressError,
  JenkinsUnreachableError,
  MalformedReportError,
} = require('../utils/errors');

const client = axios.create({
  timeout: config.jenkinsRequestTimeoutMs,
  validateStatus: () => true, // handle status codes ourselves
});

function allowedHostsText() {
  return config.platforms
    .filter((p) => p.configured)
    .map((p) => `${p.label}: ${p.allowedHosts.join(', ') || 'any'}`)
    .join('; ');
}

// Each request gets the credentials of the platform that owns its host, and credentials are
// never sent to a host outside the platforms' JENKINS_<ID>_ALLOWED_HOSTS.
client.interceptors.request.use((requestConfig) => {
  const { host } = new URL(requestConfig.url);
  const platform = config.platformForHost(host);
  if (!platform) {
    throw new ValidationError(`Jenkins host "${host}" is not allowed. Allowed hosts: ${allowedHostsText()} (JENKINS_<platform>_ALLOWED_HOSTS in .env).`);
  }
  return { ...requestConfig, auth: { username: platform.user, password: platform.apiToken } };
});

function mapTransportError(err, context) {
  if (err instanceof AppError) return err;
  if (err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || !err.response) {
    return new JenkinsUnreachableError(`Could not reach Jenkins while ${context}: ${err.message}`);
  }
  return err;
}

function assertOkStatus(response, context) {
  const { status } = response;
  if (status === 401 || status === 403) {
    throw new JenkinsAuthError(`Jenkins rejected the configured credentials while ${context} (HTTP ${status}).`);
  }
  if (status === 404) {
    throw new JenkinsNotFoundError(`Jenkins returned 404 while ${context}. Check the build URL.`);
  }
  if (status < 200 || status >= 300) {
    throw new JenkinsUnreachableError(`Jenkins returned unexpected HTTP ${status} while ${context}.`);
  }
}

async function getBuildInfo(buildUrl) {
  const apiUrl = `${buildUrl}api/json?tree=building,result,fullDisplayName,artifacts[fileName,relativePath]`;
  let response;
  try {
    response = await client.get(apiUrl);
  } catch (err) {
    throw mapTransportError(err, 'fetching build info');
  }
  assertOkStatus(response, 'fetching build info');

  const buildInfo = response.data;
  if (buildInfo.building === true) {
    throw new BuildInProgressError(`Build "${buildInfo.fullDisplayName || buildUrl}" is still running. Try again once it finishes.`);
  }
  return buildInfo;
}

function findArtifact(artifacts, candidatePaths) {
  for (const candidate of candidatePaths) {
    const found = artifacts.find((a) => a.relativePath === candidate);
    if (found) return found;
  }

  const fallback = artifacts.find((a) => /cucumber.*\.json$/i.test(a.relativePath) || /cucumber.*\.json$/i.test(a.fileName));
  if (fallback) return fallback;

  const available = artifacts.map((a) => a.relativePath).join(', ') || '(no artifacts on this build)';
  throw new ArtifactNotFoundError(
    `No Cucumber JSON artifact found. Looked for: ${candidatePaths.join(', ')}. ` +
      `Artifacts actually on this build: ${available}. ` +
      `Update CUCUMBER_JSON_ARTIFACT_PATH in .env if your job publishes it elsewhere.`
  );
}

async function fetchCucumberJson(buildUrl, relativePath) {
  const artifactUrl = `${buildUrl}artifact/${relativePath}`;
  let response;
  try {
    response = await client.get(artifactUrl, { responseType: 'text', transformResponse: [(d) => d] });
  } catch (err) {
    throw mapTransportError(err, 'fetching the Cucumber JSON artifact');
  }
  assertOkStatus(response, 'fetching the Cucumber JSON artifact');

  try {
    return JSON.parse(response.data);
  } catch {
    throw new MalformedReportError(`The artifact at "${relativePath}" is not valid JSON.`);
  }
}

async function fetchHtmlPage(url, context) {
  let response;
  try {
    response = await client.get(url, { responseType: 'text', transformResponse: [(d) => d] });
  } catch (err) {
    throw mapTransportError(err, context);
  }
  if (response.status === 404) return null;
  assertOkStatus(response, context);
  return response.data;
}

// Pages published by the Jenkins "Cucumber Reports" plugin under <build>/cucumber-html-reports/.
// Feature and failure pages are fetched on demand with fetchReportPage.
async function fetchHtmlReport(buildUrl) {
  const reportUrl = `${buildUrl}cucumber-html-reports/`;
  const featuresHtml = await fetchHtmlPage(`${reportUrl}overview-features.html`, 'fetching the Cucumber HTML features report');
  if (featuresHtml === null) return null;
  return { reportUrl, featuresHtml };
}

// A page under the report folder, e.g. 'report-feature_5_2153168176.html'. Missing pages are an error.
async function fetchReportPage(reportUrl, page) {
  const context = `fetching the Cucumber HTML page "${page}"`;
  const html = await fetchHtmlPage(`${reportUrl}${page}`, context);
  if (html === null) throw new JenkinsNotFoundError(`Jenkins returned 404 while ${context}.`);
  return html;
}

async function fetchScreenshot(screenshotUrl) {
  let response;
  try {
    response = await client.get(screenshotUrl, { responseType: 'arraybuffer' });
  } catch (err) {
    throw mapTransportError(err, 'fetching a failure screenshot');
  }
  assertOkStatus(response, 'fetching a failure screenshot');
  return Buffer.from(response.data);
}

function buildParameters(build) {
  const params = {};
  for (const action of build.actions || []) {
    for (const p of (action && action.parameters) || []) params[p.name] = p.value;
  }
  return params;
}

const COMPARABLE_RESULTS = new Set(['SUCCESS', 'UNSTABLE', 'FAILURE']);

// Most recent earlier finished build of the same job that ran with the same values for
// matchParams (e.g. Tags, Against). Parameterised jobs often run a different suite each build,
// so the immediately previous build is not necessarily comparable.
async function findPreviousComparableBuild(buildUrl, buildNumber, matchParams) {
  const jobUrl = buildUrl.replace(/\d+\/$/, '');
  const apiUrl = `${jobUrl}api/json?tree=builds[number,building,result,actions[parameters[name,value]]]{0,100}`;
  let response;
  try {
    response = await client.get(apiUrl);
  } catch (err) {
    throw mapTransportError(err, 'fetching the job build history');
  }
  assertOkStatus(response, 'fetching the job build history');

  const builds = response.data.builds || [];
  const current = builds.find((b) => String(b.number) === String(buildNumber));
  if (!current) return null;

  const currentParams = buildParameters(current);
  const matchedOn = matchParams.filter((name) => name in currentParams);

  const previous = builds.find(
    (b) =>
      b.number < current.number &&
      !b.building &&
      COMPARABLE_RESULTS.has(b.result) &&
      matchedOn.every((name) => String(buildParameters(b)[name]) === String(currentParams[name]))
  );
  if (!previous) return null;

  return {
    number: String(previous.number),
    matchedOn: matchedOn.map((name) => ({ name, value: String(currentParams[name]) })),
  };
}

// Prefers an archived Cucumber JSON artifact; falls back to the Cucumber Reports plugin HTML pages.
async function analyzeBuild(buildUrl) {
  const buildInfo = await getBuildInfo(buildUrl);

  let artifact;
  try {
    artifact = findArtifact(buildInfo.artifacts || [], config.cucumberJsonCandidatePaths);
  } catch (err) {
    if (!(err instanceof ArtifactNotFoundError)) throw err;
    const htmlReport = await fetchHtmlReport(buildUrl);
    if (!htmlReport) {
      throw new ArtifactNotFoundError(`${err.message} No Cucumber Reports plugin HTML report (cucumber-html-reports/) was found either.`);
    }
    return { buildInfo, source: 'html', ...htmlReport };
  }

  const cucumberJson = await fetchCucumberJson(buildUrl, artifact.relativePath);
  return { buildInfo, source: 'json', cucumberJson };
}

module.exports = {
  getBuildInfo,
  findArtifact,
  fetchCucumberJson,
  fetchHtmlReport,
  fetchReportPage,
  fetchScreenshot,
  findPreviousComparableBuild,
  analyzeBuild,
};
