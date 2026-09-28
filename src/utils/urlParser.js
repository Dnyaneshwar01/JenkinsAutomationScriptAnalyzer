const { ValidationError } = require('./errors');

// Matches .../job/<name>/(/job/<nested>)*/<buildNumber>(/anything-after)?
const BUILD_PATH_PATTERN = /^(.*\/job\/[^/]+(?:\/job\/[^/]+)*\/(\d+))(\/.*)?$/;

function parseBuildUrl(pastedUrl) {
  if (!pastedUrl || typeof pastedUrl !== 'string') {
    throw new ValidationError('Jenkins build URL is required.');
  }

  let url;
  try {
    url = new URL(pastedUrl.trim());
  } catch {
    throw new ValidationError(`"${pastedUrl}" is not a valid absolute URL.`);
  }

  const match = url.pathname.match(BUILD_PATH_PATTERN);
  if (!match) {
    throw new ValidationError(
      `Could not find a Jenkins job/build number in "${pastedUrl}". Expected something like ".../job/MyJob/123/".`
    );
  }

  const buildPath = match[1];
  const buildNumber = match[2];
  const jobName = buildPath
    .split('/job/')
    .slice(1)
    .map((segment) => segment.split('/')[0])
    .join(' / ');

  return {
    buildUrl: `${url.origin}${buildPath}/`,
    jobName,
    buildNumber,
  };
}

module.exports = { parseBuildUrl };
