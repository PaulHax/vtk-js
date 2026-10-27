import { aroundEach } from 'vitest';
import macro from 'vtk.js/Sources/macros';

const levels = ['warn', 'error'];
let allowances;

aroundEach(async (runTest) => {
  const original = {};
  let unexpected;
  allowances = { warn: 0, error: 0 };

  levels.forEach((level) => {
    original[level] = console[level];
    const log = (...args) => {
      if (allowances[level] > 0) {
        allowances[level] -= 1;
        return;
      }
      unexpected ??= new Error(
        `Unexpected console.${level}: ${args.map(String).join(' ')}`
      );
      original[level](...args);
    };
    console[level] = log;
    macro.setLoggerFunction(level, log);
  });

  try {
    await runTest();
  } finally {
    levels.forEach((level) => {
      console[level] = original[level];
      macro.setLoggerFunction(level, original[level]);
    });
  }

  if (unexpected) throw unexpected;
}, 0); // The test body retains its configured timeout.

export function allowLogs(level, count = 1) {
  allowances[level] += count;
}
