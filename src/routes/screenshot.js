const express = require('express');
const { parseBuildUrl } = require('../utils/urlParser');
const jenkinsClient = require('../services/jenkinsClient');
const { ValidationError } = require('../utils/errors');

const router = express.Router();

// Only images from a build's Cucumber Reports embeddings folder may be proxied.
const EMBEDDING_PATH = /^cucumber-html-reports\/embeddings\/[\w.-]+\.(png|jpe?g|gif|bmp|webp)$/i;
const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

// Jenkins requires auth, so the browser loads screenshots through here using the configured token.
router.get('/screenshot', async (req, res, next) => {
  try {
    const screenshotUrl = String(req.query.url || '');
    const { buildUrl } = parseBuildUrl(screenshotUrl);
    const relativePath = screenshotUrl.startsWith(buildUrl) ? screenshotUrl.slice(buildUrl.length) : '';
    const match = relativePath.match(EMBEDDING_PATH);
    if (!match) {
      throw new ValidationError('Only Cucumber report screenshots can be fetched.');
    }

    const image = await jenkinsClient.fetchScreenshot(screenshotUrl);
    res.set('Content-Type', CONTENT_TYPES[match[1].toLowerCase()]);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(image);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
