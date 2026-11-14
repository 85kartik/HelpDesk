require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const app = require('./app');
const { User } = require('./models');
const { startServices } = require('./services');
async function start() {
  if (!process.env.MONGODB_URI || Buffer.byteLength(process.env.JWT_SECRET || '') < 32) throw new Error('Set MONGODB_URI and a JWT_SECRET of at least 32 bytes');
  await mongoose.connect(process.env.MONGODB_URI,{ serverSelectionTimeoutMS: 5000 });
  await User.init();
  startServices();
  app.listen(Number(process.env.PORT || 5000),'0.0.0.0',() => console.log('HelpDesk API listening'));
}
start().catch(error => { console.error('Startup failed:',error.name === 'Error' ? error.message : error.name); process.exit(1); });
