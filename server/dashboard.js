const express = require('express');
const { User, Ticket, Activity } = require('./models');
const { authenticate } = require('./auth');
const { send, role, id, fail } = require('./http');
const { scope, paging } = require('./tickets');
const { cached, invalidate } = require('./services');
const admin = express.Router();
const dashboard = express.Router();
admin.use(authenticate,role('admin'));
async function users(req,res,filter) {
  const { page,limit } = paging(req.query);
  const [items,total] = await Promise.all([User.find(filter).sort({ name: 1, _id: 1 }).skip((page-1)*limit).limit(limit),User.countDocuments(filter)]);
  send(res,{ items,total,page,limit });
}
admin.get('/users',(req,res) => users(req,res,{}));
admin.get('/agents',(req,res) => users(req,res,{ role: 'agent', isActive: true }));
admin.patch('/users/:id/role',async (req,res) => {
  if (req.body?.role !== 'agent') fail(400,'Only promotion to support agent is supported');
  const user = await User.findOneAndUpdate({ _id: id(req.params.id), role: 'customer', isActive: true },{ role: 'agent' },{ returnDocument: 'after' });
  if (!user) fail(404,'Active customer not found');
  await invalidate();
  send(res,user);
});
async function stats(req,res) {
  const filter = scope(req.user);
  const adminUser = req.user.role === 'admin';
  const key = adminUser ? 'admin:dashboard:stats' : 'agent:' + req.user._id + ':stats';
  const load = async () => {
    const [counts,recent,customers,agents,activity] = await Promise.all([
      Ticket.aggregate([{ $match: filter },{ $facet: Object.fromEntries(['status','priority','category'].map(key => [key,[{ $group: { _id: '$'+key, count: { $sum: 1 } } }]])) }]),
      Ticket.find(filter).select('title category status priority createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      adminUser ? User.countDocuments({ role: 'customer' }) : 0,
      adminUser ? User.countDocuments({ role: 'agent' }) : 0,
      adminUser ? Activity.find().select('action ticket createdAt').populate('ticket','title').sort({ createdAt: -1 }).limit(5).lean() : []
    ]);
    const groups = counts[0];
    return { ...groups, total: groups.status.reduce((total,row) => total + row.count,0), recent, customers, agents, activity };
  };
  const result = req.user.role === 'customer' ? { value: await load(), cache: 'bypass' } : await cached(key,load);
  res.set('X-Cache',result.cache);
  send(res,result.value);
}
admin.get('/stats',stats);
dashboard.get('/stats',authenticate,stats);
module.exports = { admin,dashboard };
