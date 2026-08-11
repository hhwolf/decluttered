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

// react-native-webview is a native module with no Jest binary. Stubbed as a
// plain View that exposes its `source.uri`, so tests can assert we built the
// right embed URL without needing a real browser engine.
jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    // Exposes whichever source form is in use — the trailer passes `html`
    // (with a youtube.com baseUrl) rather than `uri`, because a bare uri gets
    // rejected with "Error 153" on device.
    WebView: ({ source, ...rest }) =>
      React.createElement(View, {
        accessibilityLabel: `webview:${source?.uri || source?.html || ""}`,
        ...rest,
      }),
  };
});

// expo-audio is a native module. The preview button's *policy* is covered by
// the shared engine tests; here it only needs to render and be pressable.
jest.mock("expo-audio", () => {
  const players = [];
  return {
    __players: players,
    createAudioPlayer: () => {
      const p = {
        play: jest.fn(), pause: jest.fn(), remove: jest.fn(), seekTo: jest.fn(),
        currentStatus: { isLoaded: false, playing: false },
        _emit: null,
        addListener: jest.fn((_evt, cb) => { p._emit = cb; return { remove: jest.fn() }; }),
      };
      players.push(p);
      return p;
    },
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
  };
});

// The YouTube IFrame player is a WebView underneath. Stub it as a labelled View
// so tests can assert the trailer is mounted with the right video id.
jest.mock("react-native-youtube-iframe", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: ({ videoId, ...rest }) =>
    React.createElement(View, { accessibilityLabel: `ytplayer:${videoId}`, ...rest }) };
});
