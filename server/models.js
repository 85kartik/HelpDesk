const { Schema, model } = require('mongoose');
const categories = ['technical', 'billing', 'general'];
const statuses = ['open', 'in-progress', 'resolved'];
const priorities = ['low', 'medium', 'high'];
const ref = (name, required = true) => ({ type: Schema.Types.ObjectId, ref: name, required });
const user = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['customer', 'agent', 'admin'], default: 'customer', index: true },
  sessionVersion: { type: Number, default: 0 },
  passwordReset: { type: new Schema({ nonce: String, digest: String, expiresAt: Date, attempts: Number }, { _id: false }), select: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
const attachment = new Schema({ name: String, mime: String, size: Number, content: { type: Buffer, select: false } });
const ticket = new Schema({
  title: { type: String, required: true, maxlength: 150 },
  description: { type: String, required: true, maxlength: 6000 },
  category: { type: String, enum: categories, required: true },
  priority: { type: String, enum: priorities, default: 'low' },
  status: { type: String, enum: statuses, default: 'open' },
  createdBy: ref('User'),
  assignedTo: { ...ref('User', false), default: null },
  attachments: [attachment],
  resolvedAt: { type: Date, default: null }
}, { timestamps: true, optimisticConcurrency: true });
ticket.index({ createdBy: 1, createdAt: -1 });
ticket.index({ assignedTo: 1, status: 1, createdAt: -1 });
ticket.index({ status: 1, createdAt: -1 });
const comment = new Schema({
  ticket: ref('Ticket'), user: ref('User'), message: { type: String, required: true, maxlength: 4000 }, attachments: [attachment]
}, { timestamps: true });
const activity = new Schema({
  ticket: ref('Ticket'), performedBy: ref('User'), action: { type: String, enum: ['created','status','priority','assignment'], required: true },
  oldValue: String, newValue: String
}, { timestamps: { createdAt: true, updatedAt: false } });
for (const schema of [comment, activity]) schema.index({ ticket: 1, createdAt: -1 });
module.exports = { User: model('User',user), Ticket: model('Ticket',ticket), Comment: model('Comment',comment), Activity: model('TicketActivity',activity), categories, statuses, priorities };
