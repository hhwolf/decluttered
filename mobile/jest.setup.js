// AsyncStorage has no native module under Jest; the official mock stands in.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

// @expo/vector-icons pulls in expo-font -> expo-asset, whose NATIVE modules are
// not present under Jest. Installing those packages to satisfy the resolver
// broke the real app instead (Expo Go could not find the ExpoAsset native
// module), so the icon set is stubbed here: a glyph is not what these tests
// are about, and the app keeps the versions Expo Go actually ships.
jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  const Icon = ({ name, ...rest }) => React.createElement(Text, rest, `[${name}]`);
  return { Feather: Icon, Ionicons: Icon, MaterialIcons: Icon, AntDesign: Icon };
});
