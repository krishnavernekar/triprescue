const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Not Found - ${req.originalUrl}`,
      details: [],
    },
  });
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'Internal Server Error';
  let details = err.details || [];

  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => e.message);
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid ID format for ${err.path}`;
    details = [err.message];
  }

  if (typeof statusCode !== 'number' || statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
};

module.exports = { errorHandler, notFoundHandler };
