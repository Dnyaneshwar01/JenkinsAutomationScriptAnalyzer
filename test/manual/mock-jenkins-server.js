// A tiny fake Jenkins server so the UI/API can be exercised end to end without a real Jenkins instance.
// Run with: npm run mock-jenkins   (listens on port 4000)
//
// Try these build URLs in the app UI:
//   http://localhost:4000/job/MockJob/1/   -> normal build with failures
//   http://localhost:4000/job/MockJob/2/   -> still building (409 path)
//   http://localhost:4000/job/MockJob/3/   -> bad credentials (401 path)
//   http://localhost:4000/job/MockJob/4/   -> all scenarios passed

const path = require('path');
const express = require('express');

const app = express();
const PORT = 4000;

const ARTIFACT_RELATIVE_PATH = 'cucumber-report/cucumber.json';
const fixturePath = path.join(__dirname, '..', 'fixtures', 'sample-cucumber-report.json');
const allPassedFixturePath = path.join(__dirname, '..', 'fixtures', 'sample-cucumber-report-all-passed.json');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Build 1: normal build with a cucumber.json artifact
app.get('/job/MockJob/1/api/json', requireAuth, (req, res) => {
  res.json({
    building: false,
    result: 'FAILURE',
    fullDisplayName: 'MockJob #1',
    artifacts: [{ fileName: 'cucumber.json', relativePath: ARTIFACT_RELATIVE_PATH }],
  });
});
app.get(`/job/MockJob/1/artifact/${ARTIFACT_RELATIVE_PATH}`, requireAuth, (req, res) => {
  res.sendFile(fixturePath);
});

// Build 2: still building
app.get('/job/MockJob/2/api/json', requireAuth, (req, res) => {
  res.json({ building: true, result: null, fullDisplayName: 'MockJob #2', artifacts: [] });
});

// Build 3: always unauthorized, regardless of credentials sent
app.get('/job/MockJob/3/api/json', (req, res) => {
  res.status(401).json({ error: 'Unauthorized' });
});

// Build 4: all scenarios passed
app.get('/job/MockJob/4/api/json', requireAuth, (req, res) => {
  res.json({
    building: false,
    result: 'SUCCESS',
    fullDisplayName: 'MockJob #4',
    artifacts: [{ fileName: 'cucumber.json', relativePath: ARTIFACT_RELATIVE_PATH }],
  });
});
app.get(`/job/MockJob/4/artifact/${ARTIFACT_RELATIVE_PATH}`, requireAuth, (req, res) => {
  res.sendFile(allPassedFixturePath);
});

app.listen(PORT, () => {
  console.log(`Mock Jenkins server listening on http://localhost:${PORT}`);
  console.log('Try pasting these build URLs into the app:');
  console.log(`  http://localhost:${PORT}/job/MockJob/1/  (failures)`);
  console.log(`  http://localhost:${PORT}/job/MockJob/2/  (still building)`);
  console.log(`  http://localhost:${PORT}/job/MockJob/3/  (unauthorized)`);
  console.log(`  http://localhost:${PORT}/job/MockJob/4/  (all passed)`);
});
