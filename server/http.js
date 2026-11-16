const mongoose = require('mongoose');
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function send(res, data, status = 200) { return res.status(status).json({ success: true, message: 'Operation completed successfully', data }); }
function field(value, name, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, name + ' must contain ' + min + ' to ' + max + ' characters');
  return value.trim();
}
function choice(value, choices, name) {
  if (!choices.includes(value)) fail(400, 'Invalid ' + name);
  return value;
}
function id(value) {
  if (!mongoose.isObjectIdOrHexString(value)) fail(400, 'Invalid identifier');
  return value;
}
function role(...roles) {
  return (req, res, next) => { if (!roles.includes(req.user.role)) fail(403, 'Access denied'); next(); };
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || 500;
  let message = error.message;
  if (error.code === 11000) { status = 409; message = error.keyPattern?.email ? 'An account already exists with this email. Sign in or reset your password.' : 'That record already exists'; }
  if (error.name === 'ValidationError') { status = 400; message = 'Invalid data'; }
  if (error.name === 'VersionError') { status = 409; message = 'The ticket changed. Refresh and try again.'; }
  if (error.name === 'MulterError') { status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400; message = 'Upload exceeds the allowed limits'; }
  if (status >= 500 && status !== 502) { console.error(error.name); message = 'Service temporarily unavailable'; }
  res.status(status).json({ success: false, message });
}
module.exports = { fail, send, field, choice, id, role, errorHandler };
