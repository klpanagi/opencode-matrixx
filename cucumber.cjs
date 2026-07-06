module.exports = {
  default: {
    requireModule: ["tsx"],
    require: ["src/features/bdd/fixtures/tests/**/*.ts"],
    paths: ["src/features/bdd/fixtures/login.feature"],
    format: ["progress"],
    worldParameters: {},
  },
}
