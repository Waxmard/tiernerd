import { writeFileSync } from 'node:fs';

writeFileSync(
  'dist/version.json',
  `${JSON.stringify({ buildId: process.env.EXPO_PUBLIC_BUILD_ID ?? '' })}\n`,
);
