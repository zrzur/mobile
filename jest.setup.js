/* global jest */
// Reanimated 4 and worklets have no native runtime under Jest, and their own
// mocks load the real entry (which needs one). The kit's press, sheet, swipe
// and skeleton components import Reanimated, so tests get this small stand-in:
// animations jump to their end value, shared values are plain boxes.
jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
  scheduleOnUI: (fn, ...args) => fn(...args),
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
}));

jest.mock("react-native-reanimated", () => {
  const RN = require("react-native");
  const box = (initial) => {
    const v = { value: initial };
    v.get = () => v.value;
    v.set = (next) => {
      v.value = typeof next === "function" ? next(v.value) : next;
    };
    return v;
  };
  const passThrough = (Component) => Component;
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    Image: RN.Image,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
    createAnimatedComponent: passThrough,
  };
  const ease = () => (t) => t;
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (initial) => box(initial),
    makeMutable: (initial) => box(initial),
    useAnimatedStyle: (fn) => fn(),
    useDerivedValue: (fn) => box(fn()),
    useAnimatedReaction: () => {},
    useAnimatedKeyboard: () => ({ height: box(0), state: box(0) }),
    useReducedMotion: () => false,
    withSpring: (to) => to,
    withTiming: (to, _config, done) => {
      if (done) done(true);
      return to;
    },
    withRepeat: (anim) => anim,
    withDelay: (_ms, anim) => anim,
    cancelAnimation: () => {},
    interpolate: (x, input, output) => {
      if (x <= input[0]) return output[0];
      if (x >= input[input.length - 1]) return output[output.length - 1];
      const t = (x - input[0]) / (input[input.length - 1] - input[0]);
      return output[0] + t * (output[output.length - 1] - output[0]);
    },
    Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
    Easing: { linear: ease(), quad: ease(), cubic: ease(), in: ease, out: ease, inOut: ease, bezier: ease },
    ReduceMotion: { System: "system", Always: "always", Never: "never" },
  };
});
