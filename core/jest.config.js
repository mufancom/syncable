const Path = require('path');
const {resolve} = require('module-lens');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  clearMocks: true,

  coverageDirectory: 'coverage',

  globals: {
    'ts-jest': {
      tsConfig: 'src/test/tsconfig.test.json',
    },
  },
};
