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
const previousInstrumentedLaunchEntry = replaceOnce(
  launchEntry,
  '    let delegate = ReactNativeDelegate()',
  `    NSLog("TierNerdBoot app launch entered")
    NSLog("TierNerdBoot scene manifest=%@", String(describing: Bundle.main.object(forInfoDictionaryKey: "UIApplicationSceneManifest")))
    NSLog("TierNerdBoot scene delegate class resolved=%@", NSClassFromString("TierNerdSceneDelegate") == nil ? "false" : "true")
    NSLog("TierNerdBoot main.jsbundle exists=%@", Bundle.main.url(forResource: "main", withExtension: "jsbundle") == nil ? "false" : "true")
    let delegate = ReactNativeDelegate()`,
);
const instrumentedLaunchEntry = replaceOnce(
  previousInstrumentedLaunchEntry,
  '    let delegate = ReactNativeDelegate()',
  `    RCTAddLogFunction { _, _, _, _, message in
      if let message = message, message.contains("TierNerdBoot ") {
        NSLog("%@", message)
      }
    }
    let delegate = ReactNativeDelegate()`,
);
const launchSuper = '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
const instrumentedLaunchSuper = `    NSLog("TierNerdBoot before super.application")
${launchSuper}`;
const sceneEntry = `  ) {
    guard let windowScene = scene as? UIWindowScene,`;
const instrumentedSceneEntry = `  ) {
    NSLog("TierNerdBoot scene willConnectTo entered")
    guard let windowScene = scene as? UIWindowScene,`;
const sceneFactoryStartup = '    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)';
const instrumentedSceneFactoryStartup = `    NSLog("TierNerdBoot before factory.startReactNative")
${sceneFactoryStartup}
    NSLog("TierNerdBoot after factory.startReactNative")

    func logWindow(_ window: UIWindow, phase: String) {
      let rootViewController = window.rootViewController
      let rootClass = rootViewController.map { NSStringFromClass(type(of: $0)) } ?? "nil"
      let rootBounds = rootViewController?.viewIfLoaded.map { NSCoder.string(for: $0.bounds) } ?? "nil"
      NSLog(
        "TierNerdBoot %@ window frame=%@ bounds=%@ hidden=%@ key=%@ rootViewController=%@ rootViewBounds=%@",
        phase,
        NSCoder.string(for: window.frame),
        NSCoder.string(for: window.bounds),
        window.isHidden ? "true" : "false",
        window.isKeyWindow ? "true" : "false",
        rootClass,
        rootBounds)
    }
    logWindow(window, phase: "immediate")
    DispatchQueue.main.async { [weak window] in
      guard let window = window else {
        NSLog("TierNerdBoot window released")
        return
      }
      logWindow(window, phase: "async")
    }`;
const previousInstrumentedSceneDelegate = replaceOnce(
  replaceOnce(sceneDelegate, sceneEntry, instrumentedSceneEntry),
  sceneFactoryStartup,
  instrumentedSceneFactoryStartup,
);
const legacyInstrumentedSceneDelegate = previousInstrumentedSceneDelegate.replaceAll(
  'NSCoder.string(for: ',
  'NSStringFromCGRect(',
);
const instrumentedSceneDelegate = replaceOnce(
  replaceOnce(
    previousInstrumentedSceneDelegate,
    sceneFactoryStartup,
    `    NotificationCenter.default.removeObserver(self, name: Notification.Name("RCTContentDidAppearNotification"), object: nil)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(reactContentDidAppear(_:)),
      name: Notification.Name("RCTContentDidAppearNotification"),
      object: nil)
${sceneFactoryStartup}`,
  ),
  '  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {',
  `  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func reactContentDidAppear(_ notification: Notification) {
    NSLog("TierNerdBoot native React content appeared")
    if let view = notification.object as? UIView {
      NSLog(
        "TierNerdBoot native React content view class=%@ bounds=%@",
        NSStringFromClass(type(of: view)),
        NSCoder.string(for: view.bounds))
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {`,
);

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
    const hasBootProbes = source.includes('TierNerdBoot');
    if (source.includes('@objc(TierNerdSceneDelegate)')) {
      if (!source.includes(sceneProperties) || !source.includes(sceneStartup) || source.includes(originalStartup)) {
        throw new Error('iOS scene lifecycle plugin: existing scene implementation is unexpected');
      }
      replaceOnce(source, '@objc(TierNerdSceneDelegate)', '@objc(TierNerdSceneDelegate)');
      replaceOnce(source, sceneProperties, sceneProperties);
      replaceOnce(source, sceneStartup, sceneStartup);
      const existingScene = [
        instrumentedSceneDelegate,
        previousInstrumentedSceneDelegate,
        legacyInstrumentedSceneDelegate,
      ].find((candidate) => source.includes(candidate));
      if (existingScene) {
        if (existingScene === instrumentedSceneDelegate) {
          replaceOnce(source, instrumentedSceneDelegate, instrumentedSceneDelegate);
          replaceOnce(source, instrumentedLaunchEntry, instrumentedLaunchEntry);
        } else {
          source = replaceOnce(source, existingScene, instrumentedSceneDelegate);
          source = replaceOnce(source, previousInstrumentedLaunchEntry, instrumentedLaunchEntry);
        }
        if (source.includes(launchEntry)) {
          throw new Error('iOS scene lifecycle plugin: existing launch implementation is unexpected');
        }
        replaceOnce(source, launchSuper, launchSuper);
        replaceOnce(source, instrumentedLaunchSuper, instrumentedLaunchSuper);
        if (
          source
            .replace(instrumentedLaunchEntry, '')
            .replace(instrumentedLaunchSuper, '')
            .replace(instrumentedSceneDelegate, '')
            .includes('TierNerdBoot')
        ) {
          throw new Error('iOS scene lifecycle plugin: existing boot instrumentation is unexpected');
        }
        mod.modResults.contents = source;
        return mod;
      }
      source = replaceOnce(source, sceneDelegate, instrumentedSceneDelegate);
    } else {
      if (!source.includes('public class AppDelegate: ExpoAppDelegate {') || source.includes('UIWindowSceneDelegate')) {
        throw new Error('iOS scene lifecycle plugin: unexpected AppDelegate template; refusing to modify it');
      }
      source = replaceOnce(source, originalProperties, sceneProperties);
      source = replaceOnce(source, originalStartup, sceneStartup);
      source += instrumentedSceneDelegate;
    }
    if (hasBootProbes) {
      throw new Error('iOS scene lifecycle plugin: existing launch instrumentation is unexpected');
    }
    source = replaceOnce(source, launchEntry, instrumentedLaunchEntry);
    source = replaceOnce(source, launchSuper, instrumentedLaunchSuper);
    mod.modResults.contents = source;
    return mod;
  });
};
