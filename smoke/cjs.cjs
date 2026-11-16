'use strict';

// CommonJS consumer: `require('barkapay-payhub')` must resolve to the CJS build.
const sdk = require('barkapay-payhub');
const { version } = require('barkapay-payhub/package.json');
const { run } = require('./suite.cjs');

run(sdk, 'cjs', version).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
