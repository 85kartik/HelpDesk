const multer = require('multer');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { fail } = require('./http');
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 3, fileSize: 4 * 1024 * 1024, fields: 8 } }).array('attachments',3);
const signatures = [
  ['image/png', 'png', '89504e470d0a1a0a'],
  ['image/jpeg', 'jpg', 'ffd8ff'],
  ['application/pdf', 'pdf', '255044462d']
];
function attachments(files = []) {
  return files.map(file => {
    const signature = signatures.find(([mime, , bytes]) => mime === file.mimetype && file.buffer.toString('hex',0,bytes.length / 2) === bytes);
    if (!signature) fail(415, 'Upload a PNG, JPEG, or PDF');
    const base = path.win32.basename(file.originalname).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,90);
    return { name: randomUUID() + '-' + (base || signature[1]), mime: signature[0], size: file.size, content: file.buffer };
  });
}
function metadata(item) {
  const result = item.toObject();
  result.attachments = result.attachments.map(({ _id, name, mime, size }) => ({ _id, name, mime, size }));
  return result;
}
module.exports = { upload, attachments, metadata };
