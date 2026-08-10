// jest-expo's preset mocks `expo/src/async-require/messageSocket`, which does
// not exist in expo 57.0.12. Jest resolves the path before applying the mock,
// so without this stub the whole suite fails to load.
module.exports = {};
