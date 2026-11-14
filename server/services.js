const { createClient } = require('redis');
const nodemailer = require('nodemailer');
const { randomUUID } = require('node:crypto');
let redis;
let mailer;
function startServices() {
  if (process.env.REDIS_URL) {
    redis = createClient({ url: process.env.REDIS_URL, disableOfflineQueue: true, socket: { connectTimeout: 1000, keepAlive: true, keepAliveInitialDelay: 5000 } });
    redis.on('error', () => {});
    redis.connect().catch(() => {});
  }
  if (process.env.SMTP_URL && process.env.MAIL_FROM) mailer = nodemailer.createTransport(process.env.SMTP_URL, { connectionTimeout: 5000, socketTimeout: 10000 });
}
const revisionKey = 'helpdesk:dashboard:revision';
async function cached(key, load) {
  let cacheKey;
  if (redis?.isReady) {
    try {
      const revision = await redis.get(revisionKey);
      if (revision) {
        cacheKey = 'helpdesk:' + revision + ':' + key;
        const hit = await redis.get(cacheKey);
        if (hit) return { value: JSON.parse(hit), cache: 'hit' };
      } else {
        await redis.set(revisionKey, randomUUID(), { NX: true });
        return cached(key,load);
      }
    } catch { cacheKey = undefined; }
  }
  const value = await load();
  if (cacheKey) {
    try { await redis.set(cacheKey, JSON.stringify(value), { EX: 60 }); }
    catch { return { value, cache: 'bypass' }; }
  }
  return { value, cache: cacheKey ? 'miss' : 'bypass' };
}
async function invalidate() {
  if (!redis?.isReady) return;
  try { await redis.set(revisionKey, randomUUID()); }
  catch { console.warn('Dashboard cache invalidation unavailable'); }
}
function notify(to, subject, ticket) {
  if (!mailer || !to) return;
  mailer.sendMail({ from: process.env.MAIL_FROM, to, subject, text: subject + '\n\nTicket: ' + ticket.title + '\nStatus: ' + ticket.status })
    .catch(() => console.warn('Ticket notification failed'));
}
function stopServices() { if (redis?.isOpen) redis.destroy(); }
async function sendResetCode(to, code) {
  if (!mailer) throw new Error('SMTP unavailable');
  await mailer.sendMail({ from: process.env.MAIL_FROM, to, subject: 'HelpDesk password reset code', text: 'Your HelpDesk code is ' + code + '. It expires in 10 minutes. If you did not request it, ignore this email.' });
}
module.exports = { sendResetCode, stopServices, startServices, cached, invalidate, notify };
