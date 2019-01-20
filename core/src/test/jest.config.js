const Path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  clearMocks: true,

  globals: {
    'ts-jest': {
      tsConfig: Path.join(__dirname, 'tsconfig.test.json'),
    },
  },
};
