require('dotenv').config();

const list = (value) =>
  (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

// Jenkins machines the app can read from, e.g. JENKINS_PLATFORMS=SB,QA with per-platform
// JENKINS_<ID>_ALLOWED_HOSTS / _USER / _API_TOKEN / _LABEL. USER and API_TOKEN fall back to
// JENKINS_USER / JENKINS_API_TOKEN. Without JENKINS_PLATFORMS, one platform is built from those.
function loadPlatforms() {
  const ids = list(process.env.JENKINS_PLATFORMS).map((id) => id.toUpperCase());
  const env = (id, name) => (id ? process.env[`JENKINS_${id}_${name}`] : undefined);

  const platforms = (ids.length ? ids : [null]).map((id) => {
    const user = env(id, 'USER') || process.env.JENKINS_USER;
    const apiToken = env(id, 'API_TOKEN') || process.env.JENKINS_API_TOKEN;
    const hostsVar = id ? `JENKINS_${id}_ALLOWED_HOSTS` : 'JENKINS_ALLOWED_HOSTS';
    const missing = [!user && (id ? `JENKINS_${id}_USER` : 'JENKINS_USER'), !apiToken && (id ? `JENKINS_${id}_API_TOKEN` : 'JENKINS_API_TOKEN')].filter(Boolean);
    return {
      id: id || 'DEFAULT',
      label: env(id, 'LABEL') || id || 'Jenkins',
      user,
      apiToken,
      // host[:port] values this platform's credentials may be sent to; empty means any host.
      allowedHosts: list(process.env[hostsVar]).map((h) => h.toLowerCase()),
      hostsVar,
      configured: missing.length === 0,
      problem: missing.length ? `missing ${missing.join(', ')} in .env` : null,
    };
  });

  // With several machines, the host is what picks the credentials, so each platform must list its hosts.
  if (platforms.length > 1) {
    for (const p of platforms) {
      if (p.configured && p.allowedHosts.length === 0) Object.assign(p, { configured: false, problem: `missing ${p.hostsVar} in .env` });
    }
  }

  for (const p of platforms) {
    if (!p.configured) console.warn(`Jenkins platform ${p.label} is disabled: ${p.problem}.`);
    else if (p.allowedHosts.length === 0) {
      console.warn(`${p.hostsVar} is not set: ${p.label} credentials will be sent to any host in a pasted URL.`);
    }
  }
  if (!platforms.some((p) => p.configured)) {
    console.error('No Jenkins platform has credentials. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  return platforms;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  platforms: loadPlatforms(),
  cucumberJsonCandidatePaths: list(process.env.CUCUMBER_JSON_ARTIFACT_PATH || 'cucumber-report/cucumber.json'),
  jenkinsRequestTimeoutMs: parseInt(process.env.JENKINS_REQUEST_TIMEOUT_MS || '15000', 10),
  // Build parameters that must match for a previous build to be used for new-vs-recurring comparison.
  compareBuildParams: list(process.env.COMPARE_BUILD_PARAMS || 'Tags,Against,DataCenter,isRerun'),
};

// The configured platform whose allowed hosts include host (host[:port]); a single platform
// without allowed hosts accepts any host.
config.platformForHost = (host) =>
  config.platforms.find((p) => p.configured && (p.allowedHosts.length === 0 || p.allowedHosts.includes(host.toLowerCase()))) || null;

module.exports = config;
