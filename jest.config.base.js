/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+.tsx?$": ["ts-jest", {}],
  },
  collectCoverage: true,
  coverageDirectory: "coverage",
  collectCoverageFrom: ["**/*.ts"],
  testMatch: [
    "**/tests/**/*.test.(ts|js)"
  ],
  coveragePathIgnorePatterns: [
    "jest.config.js",
    "/node_modules/",
    "/tests/",
    "/lib/",
  ],
};