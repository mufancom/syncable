module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  clearMocks: true,

  coverageDirectory: 'coverage',

  globals: {
    'ts-jest': {
      tsConfig: 'test/tsconfig.test.json',
    },
  },
};
