const palette = require('./src/design-system/tokens/palette.json');
const typography = require('./src/design-system/tokens/typography.json');

const colors = {};
for (const [name, value] of Object.entries(palette.light)) {
  colors[name] = value;
  colors[`${name}-dark`] = palette.dark[name];
}
for (const [hue, schemes] of Object.entries(palette.list)) {
  for (const [name, value] of Object.entries(schemes.light)) {
    colors[`list-${hue}-${name}`] = value;
    colors[`list-${hue}-${name}-dark`] = schemes.dark[name];
  }
}

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

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './index.ts', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: { extend: { colors, fontSize, screens: { desktop: '1024px' } } },
  plugins: [],
};
