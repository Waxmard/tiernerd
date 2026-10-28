import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NSLog("TierNerdBoot app launch entered")
    NSLog("TierNerdBoot scene manifest=%@", String(describing: Bundle.main.object(forInfoDictionaryKey: "UIApplicationSceneManifest")))
    NSLog("TierNerdBoot scene delegate class resolved=%@", NSClassFromString("TierNerdSceneDelegate") == nil ? "false" : "true")
    NSLog("TierNerdBoot main.jsbundle exists=%@", Bundle.main.url(forResource: "main", withExtension: "jsbundle") == nil ? "false" : "true")
    RCTAddLogFunction { _, _, _, _, message in
      if let message = message, message.contains("TierNerdBoot ") {
        NSLog("%@", message)
      }
    }
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

    self.launchOptions = launchOptions

    NSLog("TierNerdBoot before super.application")
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

@objc(TierNerdSceneDelegate)
class TierNerdSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    NSLog("TierNerdBoot scene willConnectTo entered")
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
    NSLog("TierNerdBoot before factory.startReactNative")
    NotificationCenter.default.removeObserver(self, name: Notification.Name("RCTContentDidAppearNotification"), object: nil)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(reactContentDidAppear(_:)),
      name: Notification.Name("RCTContentDidAppearNotification"),
      object: nil)
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
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
    }
  }

  deinit {
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
