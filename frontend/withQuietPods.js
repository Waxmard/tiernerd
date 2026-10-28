const { withPodfile } = require('expo/config-plugins');

const anchor = 'prepare_react_native_project!';
const directive = 'inhibit_all_warnings!';

module.exports = function withQuietPods(config) {
  return withPodfile(config, (mod) => {
    const source = mod.modResults.contents;
    if (source.includes(directive)) return mod;
    if (source.split(anchor).length !== 2) {
      throw new Error('quiet pods plugin: unexpected Podfile template; refusing to modify it');
    }
    mod.modResults.contents = source.replace(anchor, `${anchor}\n${directive}`);
    return mod;
  });
};
