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
