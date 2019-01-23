const Path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  clearMocks: true,

  coverageDirectory: 'coverage',

  globals: {
    'ts-jest': {
      tsConfig: Path.join(__dirname, 'src/test/tsconfig.test.json'),
    },
  },
};
