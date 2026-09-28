const express = require('express');
const { ValidationError } = require('../utils/errors');
const { buildFailureReportWorkbook } = require('../services/excelExporter');

const router = express.Router();

router.post('/export/excel', async (req, res, next) => {
  try {
    const report = req.body;
    if (!report || !Array.isArray(report.groups)) {
      throw new ValidationError('Request body must be a previously returned analysis report.');
    }

    const workbook = await buildFailureReportWorkbook(report);

    const filename = `cucumber-failure-report-${report.jobName || 'job'}-${report.buildNumber || ''}.xlsx`
      .replace(/[^\w.\-]+/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
