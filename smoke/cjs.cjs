'use strict';

// CommonJS consumer: `require('barkapay')` must resolve to the CJS build.
const sdk = require('barkapay');
const { version } = require('barkapay/package.json');
const { run } = require('./suite.cjs');

run(sdk, 'cjs', version).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
