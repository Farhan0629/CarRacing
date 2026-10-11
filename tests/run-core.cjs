/* Run with `node tests/run-core.cjs`; no packages or browser required. */
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const context = { window: {}, console }; context.APEX = context.window.APEX = {};
vm.createContext(context);
for (const file of ['js/core.js', 'js/tests.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}
const results = context.APEX.tests(), failed = results.filter(t => !t.passed);
console.log(`Core regression tests: ${results.length - failed.length}/${results.length} passed.`);
for (const test of failed) console.error(`FAIL: ${test.name}: ${test.error}`);
process.exitCode = failed.length ? 1 : 0;
