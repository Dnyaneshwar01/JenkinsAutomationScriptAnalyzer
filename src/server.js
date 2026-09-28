const path = require('path');
const express = require('express');
const config = require('./config/env');
const analyzeRoute = require('./routes/analyze');
const exportRoute = require('./routes/export');
const screenshotRoute = require('./routes/screenshot');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', analyzeRoute);
app.use('/api', exportRoute);
app.use('/api', screenshotRoute);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Jenkins Cucumber Failure Analyzer listening on http://localhost:${config.port}`);
});
