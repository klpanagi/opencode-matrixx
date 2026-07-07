module.exports = {
  default: {
    paths: ['*.feature'],
    require: ['tests/**/*.ts', 'tests/**/*.steps.ts'],
    format: ['progress', 'html:reports/cucumber-report.html'],
    formatOptions: { snippetInterface: 'async-await' },
    publishQuiet: true,
  },
};
