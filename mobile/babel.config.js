// Metro picks babel-preset-expo up on its own; Jest needs it stated.
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
