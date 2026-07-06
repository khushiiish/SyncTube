/**
 * Global Express error handler.
 * Must have 4 parameters for Express to recognize it as an error handler.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[Error] ${err.message}`, err.stack)

  const status = err.status || err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

module.exports = errorHandler
