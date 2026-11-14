const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.JWT_SECRET = randomUUID() + randomUUID();
const app = require('../app');
const { User } = require('../models');
const { startServices, stopServices } = require('../services');
const { SMTPServer } = require('smtp-server');
let mongo, http, base, redis, smtp;
const delivered = [];
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  if (process.env.TEST_REDIS_URL) {
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
    const { createClient } = require('redis');
    redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false } });
    await redis.connect();

  }
  smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, session, done) {
      let text = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => { text += chunk; });
      stream.on('end', () => {
        delivered.push({ to: session.envelope.rcptTo[0].address, text });
        done();
      });
    }
  });
  smtp.listen(0,'127.0.0.1');
  await once(smtp.server,'listening');
  process.env.SMTP_URL = 'smtp://127.0.0.1:'+smtp.server.address().port;
  process.env.MAIL_FROM = 'support@example.test';
  startServices();
  http = app.listen(0,'127.0.0.1');
  await once(http,'listening');
  base = 'http://127.0.0.1:'+http.address().port+'/api';
});
after(async () => {
  if (http) await new Promise(resolve => http.close(resolve));
  if (redis) redis.destroy();
  stopServices();
  if (smtp) await new Promise(resolve => smtp.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});
async function request(path, expected, { method='GET', auth, body, raw=false } = {}) {
  const json = body !== undefined && !(body instanceof FormData);
  const response = await fetch(base+path,{ method, headers:{ ...(auth ? { Authorization:'Bearer '+auth } : {}), ...(json ? { 'Content-Type':'application/json' } : {}) }, body:json ? JSON.stringify(body) : body });
  const data = raw ? Buffer.from(await response.arrayBuffer()) : await response.json();
  assert.equal(response.status,expected,JSON.stringify(data));
  if (!raw) assert.equal(data.success,expected<400);
  return { response,data:raw ? data : data.data };
}
function register(name,expected=201) {
  return request('/auth/register',expected,{ method:'POST', body:{ name,email:name+'@example.test',password:'strong test password',role:'admin' } });
}
test('ticket lifecycle, scoped roles, attachment access, validation, and dashboards',async () => {
  await request('/health',200);
  await request('/auth/profile',401);
  const { data:owner } = await register('owner');
  const { data:outsider } = await register('outsider');
  const { data:agent } = await register('agent');
  const { data:admin } = await register('admin');
  await register('owner',409);
  assert.equal(owner.user.role,'customer');
  assert.equal(owner.user.password,undefined);
  await request('/auth/login',401,{ method:'POST',body:{ email:'owner@example.test',password:'wrong' } });
  await request('/auth/login',200,{ method:'POST',body:{ email:'owner@example.test',password:'strong test password' } });
  process.env.ADMIN_SIGNUP_CODE = randomUUID();
  const registration = { name:'Setup Admin',email:'setup@example.test',password:'strong test password',accountType:'admin' };
  await request('/auth/register',403,{ method:'POST',body:{ ...registration,setupCode:'wrong' } });
  const { data:setupAdmin } = await request('/auth/register',201,{ method:'POST',body:{ ...registration,setupCode:process.env.ADMIN_SIGNUP_CODE } });
  assert.equal(setupAdmin.user.role,'admin');
  await User.findByIdAndUpdate(admin.user._id,{ role:'admin' });
  await request('/admin/users',403,{ auth:owner.token });
  await request('/admin/users/'+agent.user._id+'/role',200,{ auth:admin.token,method:'PATCH',body:{ role:'agent' } });
  await request('/auth/profile',200,{ auth:agent.token });
  assert.equal((await request('/admin/users?page=2&limit=2',200,{ auth:admin.token })).data.items.length,2);
  assert.deepEqual((await request('/admin/agents',200,{ auth:admin.token })).data.items.map(user => user._id),[agent.user._id]);
  await request('/admin/stats',403,{ auth:agent.token });
  await request('/auth/profile',401,{ auth:'invalid-token' });
  await request('/does-not-exist',404);
  await request('/tickets/my?limit=101',400,{ auth:owner.token });
  await request('/tickets',400,{ method:'POST',auth:owner.token,body:{ title:'Problem',description:'Details',category:'invalid' } });
  await request('/tickets/bad-id',400,{ auth:owner.token });
  const form = new FormData();
  form.set('title','Payment confirmation');
  form.set('description','The payment confirmation did not arrive.');
  form.set('category','billing');
  const file = Buffer.from('%PDF-1.4 fixture');
  form.append('attachments',new Blob([file],{ type:'application/pdf' }),'receipt.pdf');
  const { data:ticket } = await request('/tickets',201,{ method:'POST',auth:owner.token,body:form });
  assert.equal(ticket.priority,'low');
  assert.equal(ticket.attachments[0].content,undefined);
  const path='/tickets/'+ticket._id;
  const download=path+'/attachments/'+ticket.attachments[0]._id;
  await request(path,404,{ auth:outsider.token });
  await request(download,404,{ auth:outsider.token });
  assert.deepEqual((await request(download,200,{ auth:owner.token,raw:true })).data,file);
  await request(path,404,{ auth:agent.token });
  await request(path+'/priority',403,{ method:'PATCH',auth:owner.token,body:{priority:'high'} });
  await request(path+'/assign',200,{ method:'PATCH',auth:admin.token,body:{agentId:agent.user._id} });
  assert.equal((await request('/tickets/assigned',200,{ auth:agent.token })).data.total,1);
  assert.equal((await request('/tickets',200,{ auth:admin.token })).data.total,1);
  assert.equal((await request('/tickets?status=pending',200,{ auth:admin.token })).data.total,1);
  assert.equal((await request('/tickets?status=resolved',200,{ auth:admin.token })).data.total,0);
  assert.equal((await request('/admin/stats',200,{ auth:admin.token })).data.total,1);
  assert.equal((await request('/dashboard/stats',200,{ auth:outsider.token })).data.total,0);
  await request(path+'/priority',200,{ method:'PATCH',auth:admin.token,body:{priority:'high'} });
  const rejected = new FormData();
  rejected.set('message','Invalid attachment');
  rejected.set('attachments',new Blob(['plain text'],{type:'application/pdf'}),'invalid.pdf');
  await request(path+'/comments',415,{ method:'POST',auth:agent.token,body:rejected });
  const reply = new FormData();
  reply.set('message','We are reviewing this.');
  reply.set('attachments',new Blob([file],{type:'application/pdf'}),'reply.pdf');
  const { data:comment } = await request(path+'/comments',201,{ method:'POST',auth:agent.token,body:reply });
  const replyDownload = path+'/comments/'+comment._id+'/attachments/'+comment.attachments[0]._id;
  await request(replyDownload,404,{ auth:outsider.token });
  assert.deepEqual((await request(replyDownload,200,{ auth:owner.token,raw:true })).data,file);
  assert.equal((await request(path+'/comments',200,{ auth:owner.token })).data.total,1);
  const first=await request('/dashboard/stats',200,{ auth:agent.token });
  assert.equal(first.data.total,1);
  if (redis) {
    assert.equal(first.response.headers.get('x-cache'),'miss');
    const revision = await redis.get('helpdesk:dashboard:revision');
    const key = 'helpdesk:'+revision+':agent:'+agent.user._id+':stats';
    const ttl = await redis.ttl(key);
    assert.ok(ttl > 0 && ttl <= 60);
    const second=await request('/dashboard/stats',200,{ auth:agent.token });
    assert.equal(second.response.headers.get('x-cache'),'hit');
    await redis.pExpire(key,100);
    for (let i=0; i<25 && await redis.exists(key); i++) {
      await new Promise(resolve => setTimeout(resolve,20));
    }
    assert.equal(await redis.exists(key),0);
    const expired = await request('/dashboard/stats',200,{ auth:agent.token });
    assert.equal(expired.response.headers.get('x-cache'),'miss');
  } else assert.equal(first.response.headers.get('x-cache'),'bypass');
  await request(path+'/status',200,{ method:'PATCH',auth:agent.token,body:{status:'resolved'} });
  assert.equal((await request('/tickets?status=pending',200,{ auth:admin.token })).data.total,0);
  assert.equal((await request('/tickets?status=resolved',200,{ auth:admin.token })).data.total,1);
  const stats=await request('/dashboard/stats',200,{ auth:agent.token });
  assert.deepEqual(stats.data.status,[{ _id:'resolved',count:1 }]);
  if (redis) assert.equal(stats.response.headers.get('x-cache'),'miss');
  assert.equal((await request('/tickets/my?q=Payment&status=resolved',200,{ auth:owner.token })).data.total,1);
  assert.equal((await request(path,200,{ auth:owner.token })).data.history.length,4);
  await request(path,200,{ method:'DELETE',auth:admin.token });
  await request(path,404,{ auth:owner.token });
});

test('Nodemailer delivers lifecycle notifications to the right recipients', async () => {
  const expected = [
    ['owner@example.test','Ticket received'],
    ['owner@example.test','Ticket assignment updated'],
    ['agent@example.test','Ticket assigned to you'],
    ['owner@example.test','Ticket resolved']
  ];
  for (let attempt = 0; delivered.length < expected.length && attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve,50));
  }
  assert.equal(delivered.length,expected.length);
  for (const [to,subject] of expected) {
    assert.ok(delivered.some(mail => mail.to === to && mail.text.includes('Subject: '+subject) && mail.text.includes('Payment confirmation')),subject);
  }
});
test('password change and emailed one-time reset invalidate previous sessions', async () => {
  const { data:account } = await register('recovery');
  const email = account.user.email;
  const auth = account.token;
  const changed = 'changed test password';
  const replacement = 'recovered test password';
  await request('/auth/change-password',400,{ method:'POST',auth,body:{ currentPassword:'wrong',newPassword:changed } });
  await request('/auth/change-password',200,{ method:'POST',auth,body:{ currentPassword:'strong test password',newPassword:changed } });
  await request('/auth/profile',401,{ auth });
  const { data:session } = await request('/auth/login',200,{ method:'POST',body:{ email,password:changed } });
  await request('/auth/forgot-password',404,{ method:'POST',body:{ email:'unknown@example.test' } });
  await request('/auth/forgot-password',202,{ method:'POST',body:{ email } });
  let mail;
  for (let i=0; i<100 && !mail; i++) {
    mail = delivered.find(item => item.to === email && item.text.includes('Subject: HelpDesk password reset code'));
    if (!mail) await new Promise(resolve => setTimeout(resolve,50));
  }
  const code = mail?.text.match(/Your HelpDesk code is (\d{6})/)?.[1];
  assert.ok(code,'Expected a reset code over SMTP');
  const body = { email,code,newPassword:replacement };
  await request('/auth/reset-password',400,{ method:'POST',body:{ ...body,code:code === '000000' ? '000001' : '000000' } });
  await request('/auth/reset-password',200,{ method:'POST',body });
  await request('/auth/reset-password',400,{ method:'POST',body });
  await request('/auth/profile',401,{ auth:session.token });
  await request('/auth/login',401,{ method:'POST',body:{ email,password:changed } });
  await request('/auth/login',200,{ method:'POST',body:{ email,password:replacement } });
});
