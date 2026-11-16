const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const { User } = require('./models');
const { fail, send, field } = require('./http');
const auth = express.Router();
const settings = { algorithms: ['HS256'], issuer: 'helpdesk' };
const publicUser = ({ _id, name, email, role }) => ({ _id, name, email, role });
function emailAddress(value) {
  const email = field(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address');
  return email;
}
function password(value, min = 12) {
  if (typeof value !== 'string' || value.length < min || Buffer.byteLength(value) > 72) fail(400, min === 1 ? 'Enter a password of up to 72 bytes' : 'Use a password with at least 12 characters and at most 72 bytes');
  return value;
}
function session(res, user, status) {
  const token = jwt.sign({ version: user.sessionVersion ?? 0 }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: settings.issuer, subject: String(user._id), expiresIn: '1h' });
  res.set('Cache-Control', 'no-store');
  send(res, { user: publicUser(user), token }, status);
}
async function authenticate(req, res, next) {
  const token = /^Bearer (\S+)$/i.exec(req.get('Authorization') || '')?.[1];
  let claims;
  try { claims = jwt.verify(token, process.env.JWT_SECRET, settings); }
  catch { fail(401, 'Sign in to continue'); }
  if (!/^[a-f0-9]{24}$/i.test(claims?.sub || '')) fail(401, 'Invalid session');
  req.user = await User.findOne({ _id: claims.sub, isActive: true });
  if (!req.user) fail(401, 'Account unavailable');
  if ((claims.version ?? 0) !== (req.user.sessionVersion ?? 0)) fail(401, 'Sign in again');
  next();
}
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, message: 'Too many authentication attempts' } });
const dummy = bcrypt.hashSync('helpdesk dummy password', 12);
auth.post('/register', limiter, async (req,res) => {
  const { name, email, password: input } = req.body || {};
  let role = 'customer';
  if (req.body?.accountType === 'admin') {
    const expected = process.env.ADMIN_SIGNUP_CODE;
    const supplied = req.body.setupCode;
    const digest = value => createHash('sha256').update(value).digest();
    if (!expected || typeof supplied !== 'string' || !timingSafeEqual(digest(expected),digest(supplied))) {
      fail(403, 'Administrator setup code is invalid or registration is disabled');
    }
    role = 'admin';
  }
  const user = await User.create({ name: field(name, 'Name', 100), email: emailAddress(email), password: await bcrypt.hash(password(input),12), role });
  await require('./services').invalidate();
  session(res,user,201);
});
auth.post('/login', limiter, async (req,res) => {
  const { email, password: input } = req.body || {};
  const candidate = password(input,1);
  const user = await User.findOne({ email: emailAddress(email), isActive: true }).select('+password');
  if (!(await bcrypt.compare(candidate,user?.password || dummy)) || !user) fail(401,'Email or password is incorrect. Check both and try again.');
  session(res,user,200);
});
auth.get('/profile', authenticate, (req,res) => send(res,publicUser(req.user)));
const recoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { success: false, message: 'Too many password recovery requests' } });
const resetDigest = (nonce, code) => createHmac('sha256', process.env.JWT_SECRET).update(nonce + ':' + code).digest('hex');
auth.post('/forgot-password', recoveryLimiter, async (req,res) => {
  const email = emailAddress(req.body?.email);
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM) fail(503,'Email service unavailable');
  if (!(await User.exists({ email, isActive: true }))) fail(404,'No active account found for this email');
  const code = String(randomInt(1000000)).padStart(6,'0');
  const nonce = randomUUID();
  const reset = { nonce, digest: resetDigest(nonce,code), expiresAt: new Date(Date.now()+600000), attempts: 0 };
  const user = await User.findOneAndUpdate({
    email, isActive: true, 'passwordReset.expiresAt': { $not: { $gt: new Date(Date.now()+540000) } }
  },{ $set: { passwordReset: reset } });
  if (!user) fail(429,'Please wait one minute before requesting another code');
  try { await require('./services').sendResetCode(email,code); }
  catch {
    await User.updateOne({ _id: user._id, 'passwordReset.nonce': nonce },{ $unset: { passwordReset: 1 } });
    fail(502,'Could not send the code. Try again.');
  }
  send(res,{ message:'Verification code sent.' },202);
});
auth.post('/reset-password', recoveryLimiter, async (req,res) => {
  const email = emailAddress(req.body?.email);
  const next = password(req.body?.newPassword);
  const code = req.body?.code;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) fail(400,'Enter a six-digit code');
  const filter = { email, isActive: true, 'passwordReset.expiresAt': { $gt: new Date() }, 'passwordReset.attempts': { $lt: 5 } };
  const user = await User.findOneAndUpdate(filter,{ $inc: { 'passwordReset.attempts': 1 } }).select('+passwordReset');
  if (!user || !timingSafeEqual(Buffer.from(user.passwordReset.digest),Buffer.from(resetDigest(user.passwordReset.nonce,code)))) fail(400,'Invalid or expired code');
  const result = await User.updateOne({ _id: user._id, isActive: true, 'passwordReset.nonce': user.passwordReset.nonce, 'passwordReset.expiresAt': { $gt: new Date() } },{
    $set: { password: await bcrypt.hash(next,12) }, $unset: { passwordReset: 1 }, $inc: { sessionVersion: 1 }
  });
  if (!result.modifiedCount) fail(400,'Invalid or expired code');
  send(res,{});
});
auth.post('/change-password', authenticate, limiter, async (req,res) => {
  const current = password(req.body?.currentPassword,1);
  const next = password(req.body?.newPassword);
  const user = await User.findOne({ _id: req.user._id, isActive: true }).select('+password');
  if (!user || (user.sessionVersion ?? 0) !== (req.user.sessionVersion ?? 0) || !(await bcrypt.compare(current,user.password))) fail(400,'Current password is incorrect');
  const result = await User.updateOne({ _id: user._id, isActive: true, password: user.password },{
    $set: { password: await bcrypt.hash(next,12) }, $unset: { passwordReset: 1 }, $inc: { sessionVersion: 1 }
  });
  if (!result.modifiedCount) fail(409,'Password changed. Sign in again.');
  send(res,{});
});
module.exports = { auth, authenticate, emailAddress, password };
