import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): Partial<ExpoConfig> => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: process.env.IOS_BUNDLE_ID || config.ios?.bundleIdentifier,
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-image-picker',
        {
          photosPermission: 'Choose a photo to use as your app background.',
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
      './withQuietPods',
      './withIosDeploymentTarget',
      ...(clientId
        ? [
            [
              '@react-native-google-signin/google-signin',
              {
                iosUrlScheme: `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`,
              },
            ] as [string, { iosUrlScheme: string }],
          ]
        : []),
    ],
  };
};
