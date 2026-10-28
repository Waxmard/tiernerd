console.info('TierNerdBoot JS entry reached');
const { registerRootComponent } = require('expo');
console.info('TierNerdBoot Expo loaded');
const App = require('./App').default;
console.info('TierNerdBoot App loaded');
registerRootComponent(App);
console.info('TierNerdBoot main registered');
