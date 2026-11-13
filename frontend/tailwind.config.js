const plugin = require('tailwindcss/plugin');
const palette = require('./src/design-system/tokens/palette.json');
const typography = require('./src/design-system/tokens/typography.json');

const colors = {};
for (const [name, value] of Object.entries(palette.light)) {
  colors[name] = value;
  colors[`${name}-dark`] = palette.dark[name];
}

const fontFamily = {
  display: 'BricolageGrotesque-SemiBold',
  prose: 'Newsreader-Italic',
};

const fontSize = Object.fromEntries(
  Object.entries(typography).map(([name, value]) => [
    name,
    [
      `${value.fontSize}px`,
      {
        lineHeight: `${value.lineHeight}px`,
        fontWeight: value.fontWeight,
        ...(value.letterSpacing === undefined
          ? {}
          : { letterSpacing: `${value.letterSpacing}px` }),
      },
    ],
  ])
);

const fontFamilyUtilities = Object.fromEntries(
  Object.entries(typography)
    .filter(([, value]) => value.fontFamily !== undefined)
    .map(([name, value]) => [
      `.text-${name}`,
      { fontFamily: fontFamily[value.fontFamily] },
    ])
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './index.ts', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: { extend: { colors, fontSize, fontFamily } },
  plugins: [plugin(({ addUtilities }) => addUtilities(fontFamilyUtilities))],
};
