// Loads the browser content scripts into Node so their pure functions can be tested.
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'extension', 'src', 'content');

function load(...files) {
  for (const file of files) require(path.join(ROOT, file));
  return globalThis.SubSweep;
}

module.exports = { load };
