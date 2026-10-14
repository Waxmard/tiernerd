const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(getDefaultConfig(__dirname), {
  input: './global.css',
  // NativeWind defaults to 1rem = 14 on native, which would shrink every
  // spacing/typography utility ~12% relative to the web build and the 4px
  // scale these classes were mapped from.
  inlineRem: 16,
});
