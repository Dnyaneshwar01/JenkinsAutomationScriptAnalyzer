const { AppError } = require('../utils/errors');

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.', code: 'INTERNAL_ERROR' });
}

module.exports = errorHandler;
