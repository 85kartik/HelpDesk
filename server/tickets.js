const express = require('express');
const { User, Ticket, Comment, Activity, categories, statuses, priorities } = require('./models');
const { fail, send, field, choice, id, role } = require('./http');
const { authenticate } = require('./auth');
const { upload, attachments, metadata } = require('./uploads');
const { invalidate, notify } = require('./services');
const tickets = express.Router();
tickets.use(authenticate);
const people = 'name role';
function scope(user) {
  if (user.role === 'customer') return { createdBy: user._id };
  if (user.role === 'agent') return { assignedTo: user._id };
  return {};
}
async function findTicket(req, projection) {
  const ticket = await Ticket.findOne({ _id: id(req.params.id), ...scope(req.user) }).select(projection);
  if (!ticket) fail(404,'Ticket not found');
  return ticket;
}
async function access(req,res,next) { req.ticket = await findTicket(req,'-attachments'); next(); }
function paging(query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 15);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail(400,'Invalid pagination');
  return { page, limit };
}
async function list(req,res) {
  const filter = scope(req.user);
  for (const [key, values] of Object.entries({ status: statuses, priority: priorities, category: categories })) {
    if (key === 'status' && req.user.role === 'admin' && req.query.status === 'pending') {
      filter.status = { $in: ['open','in-progress'] };
    } else if (req.query[key]) {
      filter[key] = choice(req.query[key],values,key);
    }
  }
  if (req.query.q) {
    const q = field(req.query.q,'Search',100).replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
    filter.title = { $regex: q, $options: 'i' };
  }
  const { page, limit } = paging(req.query);
  const order = req.query.sort === 'oldest' ? 1 : -1;
  const [items,total] = await Promise.all([
    Ticket.find(filter).select('-attachments -description').populate('createdBy assignedTo',people)
      .sort({ createdAt: order, _id: order }).skip((page-1)*limit).limit(limit),
    Ticket.countDocuments(filter)
  ]);
  send(res,{ items, total, page, limit });
}
tickets.get('/my',role('customer'),list);
tickets.get('/assigned',role('agent'),list);
tickets.get('/',role('admin'),list);
tickets.post('/',role('customer'),upload,async (req,res) => {
  const body = req.body || {};
  const ticket = await Ticket.create({
    title: field(body.title,'Title',150), description: field(body.description,'Description',6000),
    category: choice(body.category,categories,'category'), createdBy: req.user._id, attachments: attachments(req.files)
  });
  await Activity.create({ ticket: ticket._id, performedBy: req.user._id, action: 'created' });
  await invalidate();
  notify(req.user.email,'Ticket received',ticket);
  send(res,metadata(ticket),201);
});
tickets.get('/:id',async (req,res) => {
  const ticket = await findTicket(req);
  await ticket.populate('createdBy assignedTo',people);
  const history = await Activity.find({ ticket: ticket._id }).populate('performedBy',people).sort({ createdAt: -1, _id: -1 }).limit(100);
  send(res,{ ticket, history });
});
tickets.get('/:id/comments',access,async (req,res) => {
  const { page, limit } = paging(req.query);
  const filter = { ticket: req.ticket._id };
  const [items,total] = await Promise.all([
    Comment.find(filter).populate('user',people).sort({ createdAt: -1, _id: -1 }).skip((page-1)*limit).limit(limit),
    Comment.countDocuments(filter)
  ]);
  send(res,{ items,total,page,limit });
});
tickets.post('/:id/comments',access,upload,async (req,res) => {
  const comment = await Comment.create({ ticket: req.ticket._id, user: req.user._id, message: field(req.body?.message,'Message',4000), attachments: attachments(req.files) });
  send(res,metadata(comment),201);
});
function download(res, item, attachmentId) {
  const file = item?.attachments.id(id(attachmentId));
  if (!file?.content) fail(404,'Attachment not found');
  res.set('Cache-Control','private, no-store').attachment(file.name).type(file.mime).send(file.content);
}
tickets.get('/:id/attachments/:file',async (req,res) => {
  download(res,await findTicket(req,'+attachments.content'),req.params.file);
});
tickets.get('/:id/comments/:comment/attachments/:file',access,async (req,res) => {
  const comment = await Comment.findOne({ _id: id(req.params.comment), ticket: req.ticket._id }).select('+attachments.content');
  download(res,comment,req.params.file);
});
async function change(req,res,key,value,action,extra = {}) {
  const ticket = req.ticket;
  const oldValue = ticket[key];
  if (String(oldValue) === String(value)) return send(res,ticket);
  ticket.set({ [key]: value, ...extra });
  await ticket.save();
  await invalidate();
  await Activity.create({ ticket: ticket._id, performedBy: req.user._id, action, oldValue: oldValue == null ? undefined : String(oldValue), newValue: value == null ? undefined : String(value) });
  if (action !== 'priority') {
    const customer = await User.findById(ticket.createdBy).select('email');
    notify(customer?.email, action === 'assignment' ? 'Ticket assignment updated' : value === 'resolved' ? 'Ticket resolved' : 'Ticket status updated',ticket);
  }
  send(res,ticket);
}
tickets.patch('/:id/status',role('admin','agent'),access,(req,res) => {
  const status = choice(req.body?.status,statuses,'status');
  return change(req,res,'status',status,'status',{ resolvedAt: status === 'resolved' ? new Date() : null });
});
tickets.patch('/:id/priority',role('admin'),access,(req,res) => change(req,res,'priority',choice(req.body?.priority,priorities,'priority'),'priority'));
tickets.patch('/:id/assign',role('admin'),access,async (req,res) => {
  const agentId = req.body?.agentId;
  const agent = agentId === null ? null : await User.findOne({ _id: id(agentId), role: 'agent', isActive: true });
  if (agentId !== null && !agent) fail(400,'Choose an active support agent');
  const changed = String(req.ticket.assignedTo) !== String(agent?._id ?? null);
  await change(req,res,'assignedTo',agent?._id ?? null,'assignment');
  if (changed) notify(agent?.email,'Ticket assigned to you',req.ticket);
});
tickets.delete('/:id',role('admin'),access,async (req,res) => {
  const { deletedCount } = await Ticket.deleteOne({ _id: req.ticket._id, __v: req.ticket.__v });
  if (!deletedCount) fail(409,'The ticket changed. Refresh and try again.');
  await invalidate();
  await Promise.all([Comment.deleteMany({ ticket: req.ticket._id }),Activity.deleteMany({ ticket: req.ticket._id })]);
  send(res,{ id: req.ticket._id });
});
module.exports = { tickets, scope, paging };
