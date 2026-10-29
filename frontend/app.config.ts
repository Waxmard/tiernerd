import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): Partial<ExpoConfig> => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      './withIosSceneLifecycle',
      './withQuietPods',
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
