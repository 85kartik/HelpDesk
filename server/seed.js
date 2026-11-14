require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');
const { emailAddress,password } = require('./auth');
async function seed() {
  const email = emailAddress(process.env.ADMIN_EMAIL);
  const hash = await bcrypt.hash(password(process.env.ADMIN_PASSWORD),12);
  await mongoose.connect(process.env.MONGODB_URI);
  await User.init();
  if (await User.exists({ role: 'admin' })) throw new Error('An administrator already exists');
  await User.create({ _id: new mongoose.Types.ObjectId('000000000000000000000001'), name: 'HelpDesk Administrator', email, password: hash, role: 'admin' });
  console.log('Administrator created. Remove the seed credentials from your environment.');
}
seed().catch(() => { console.error('Seed failed. Check configuration, existing admin, or email conflict.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
