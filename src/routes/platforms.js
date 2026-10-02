const express = require('express');
const config = require('../config/env');

const router = express.Router();

// Lets the UI offer a platform selector and pick the platform matching a pasted URL's host.
router.get('/platforms', (req, res) => {
  res.json(
    config.platforms.map(({ id, label, allowedHosts, configured, problem }) => ({ id, label, allowedHosts, configured, problem }))
  );
});

module.exports = router;
