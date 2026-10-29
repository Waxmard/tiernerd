const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');
const { isDeepStrictEqual } = require('node:util');

const originalStartup = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;
const sceneStartup = `    self.launchOptions = launchOptions`;
const originalProperties = `  var window: UIWindow?`;
const sceneProperties = `  var window: UIWindow?
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?`;
const sceneDelegate = `
@objc(TierNerdSceneDelegate)
class TierNerdSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      fatalError("Unable to initialize the React Native scene")
    }

    var launchOptions = appDelegate.launchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
    }
    for context in connectionOptions.urlContexts {
      forward(context, to: appDelegate)
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
    }
    for activity in connectionOptions.userActivities {
      _ = appDelegate.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      forward(context, to: appDelegate)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidEnterBackground(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillEnterForeground(UIApplication.shared)
  }

  private func forward(_ context: UIOpenURLContext, to appDelegate: AppDelegate) {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [
      .openInPlace: context.options.openInPlace
    ]
    if let source = context.options.sourceApplication {
      options[.sourceApplication] = source
    }
    if let annotation = context.options.annotation {
      options[.annotation] = annotation
    }
    _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
  }
}
`;

function replaceOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error('iOS scene lifecycle plugin: unexpected AppDelegate template; refusing to modify it');
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const launchEntry = `  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()`;
const launchSuper = '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)';

module.exports = function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    const manifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'TierNerdSceneDelegate',
          },
        ],
      },
    };
    const existing = mod.modResults.UIApplicationSceneManifest;
    if (existing !== undefined && !isDeepStrictEqual(structuredClone(existing), manifest)) {
      throw new Error('iOS scene lifecycle plugin: existing scene manifest conflicts with the single-scene configuration');
    }
    mod.modResults.UIApplicationSceneManifest = manifest;
    return mod;
  });

  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('iOS scene lifecycle plugin requires the Swift Expo AppDelegate');
    }
    let source = mod.modResults.contents;
    if (source.includes('@objc(TierNerdSceneDelegate)')) {
      if (!source.includes(sceneProperties) || !source.includes(sceneStartup) || source.includes(originalStartup)) {
        throw new Error('iOS scene lifecycle plugin: existing scene implementation is unexpected');
      }
      replaceOnce(source, '@objc(TierNerdSceneDelegate)', '@objc(TierNerdSceneDelegate)');
      replaceOnce(source, sceneProperties, sceneProperties);
      replaceOnce(source, sceneStartup, sceneStartup);
      if (!source.includes(sceneDelegate)) {
        const sceneStart = source.indexOf('\n@objc(TierNerdSceneDelegate)');
        if (sceneStart < 0) {
          throw new Error('iOS scene lifecycle plugin: existing scene implementation is unexpected');
        }
        source = source.slice(0, sceneStart) + sceneDelegate;
      }
      if (!source.includes(launchEntry)) {
        const launchStart = source.indexOf('  public override func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil\n  ) -> Bool {');
        const delegateIdx = source.indexOf('    let delegate = ReactNativeDelegate()', launchStart);
        if (launchStart < 0 || delegateIdx < 0) {
          throw new Error('iOS scene lifecycle plugin: existing launch implementation is unexpected');
        }
        source = source.slice(0, launchStart) + launchEntry + source.slice(delegateIdx + '    let delegate = ReactNativeDelegate()'.length);
      }
      const superIdx = source.indexOf(launchSuper);
      if (superIdx < 0) {
        throw new Error('iOS scene lifecycle plugin: existing launch implementation is unexpected');
      }
      const launchOptionsIdx = source.indexOf(`${sceneStartup}\n\n`);
      if (launchOptionsIdx >= 0 && launchOptionsIdx < superIdx) {
        const prefixStart = launchOptionsIdx + `${sceneStartup}\n\n`.length;
        if (prefixStart < superIdx) {
          source = source.slice(0, prefixStart) + source.slice(superIdx);
        }
      }
      replaceOnce(source, sceneDelegate, sceneDelegate);
      replaceOnce(source, launchEntry, launchEntry);
      replaceOnce(source, launchSuper, launchSuper);
    } else {
      if (!source.includes('public class AppDelegate: ExpoAppDelegate {') || source.includes('UIWindowSceneDelegate')) {
        throw new Error('iOS scene lifecycle plugin: unexpected AppDelegate template; refusing to modify it');
      }
      source = replaceOnce(source, originalProperties, sceneProperties);
      source = replaceOnce(source, originalStartup, sceneStartup);
      source += sceneDelegate;
      replaceOnce(source, launchEntry, launchEntry);
      replaceOnce(source, launchSuper, launchSuper);
    }
    if (source.includes(`TierNerd${'Boot'}`)) {
      throw new Error('iOS scene lifecycle plugin: existing boot instrumentation is unexpected');
    }
    mod.modResults.contents = source;
    return mod;
  });
};
