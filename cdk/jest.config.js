 
 
const baseConfig = require('../jest.config.base');

 
module.exports = {
    ...baseConfig,
    testPathIgnorePatterns: ['/node_modules/', '/cdk.out/'],
    coveragePathIgnorePatterns: [
        ...baseConfig.coveragePathIgnorePatterns,
        '/cdk.out/',
    ],
    // setupFiles: ['./tests/jest/setEnvVars.js'],
};
