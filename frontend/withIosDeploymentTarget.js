const { withPodfile, withXcodeProject } = require('expo/config-plugins');

const deploymentTarget = '17.0';
const platformLine = /^platform :ios, .*$/m;

module.exports = function withIosDeploymentTarget(config) {
  config = withPodfile(config, (mod) => {
    const source = mod.modResults.contents;
    if (!platformLine.test(source)) {
      throw new Error('deployment target plugin: unexpected Podfile template; refusing to modify it');
    }
    mod.modResults.contents = source.replace(platformLine, `platform :ios, '${deploymentTarget}'`);
    return mod;
  });

  return withXcodeProject(config, (mod) => {
    const settings = Object.values(mod.modResults.pbxXCBuildConfigurationSection()).filter(
      (entry) => entry && entry.buildSettings && entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET !== undefined
    );
    if (settings.length === 0) {
      throw new Error('deployment target plugin: no IPHONEOS_DEPLOYMENT_TARGET build settings found');
    }
    for (const entry of settings) entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
    return mod;
  });
};
