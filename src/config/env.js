require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jenkinsUser: required('JENKINS_USER'),
  jenkinsApiToken: required('JENKINS_API_TOKEN'),
  cucumberJsonCandidatePaths: (process.env.CUCUMBER_JSON_ARTIFACT_PATH || 'cucumber-report/cucumber.json')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
  jenkinsRequestTimeoutMs: parseInt(process.env.JENKINS_REQUEST_TIMEOUT_MS || '15000', 10),
  // Build parameters that must match for a previous build to be used for new-vs-recurring comparison.
  compareBuildParams: (process.env.COMPARE_BUILD_PARAMS || 'Tags,Against,DataCenter,isRerun')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
  // host[:port] values the Jenkins credentials may be sent to; empty means any host.
  jenkinsAllowedHosts: (process.env.JENKINS_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
};

if (config.jenkinsAllowedHosts.length === 0) {
  console.warn('JENKINS_ALLOWED_HOSTS is not set: Jenkins credentials will be sent to any host in a pasted URL.');
}

module.exports = config;
