/**
 * Forma Apparels Backend — Unified API Response Helper
 * Enforces predictable response envelopes across Express route handlers.
 */

/**
 * Send a standardized success response.
 */
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json(data);
}

/**
 * Send a standardized error response.
 */
function sendError(res, message, statusCode = 500) {
  const errorMsg = typeof message === 'string' ? message : (message?.message || 'Internal Server Error');
  return res.status(statusCode).json({ error: errorMsg });
}

module.exports = {
  sendSuccess,
  sendError
};
