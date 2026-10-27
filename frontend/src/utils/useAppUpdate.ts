import { useLayoutEffect } from 'react';
import { Platform } from 'react-native';
import {
  blockAppUpdate,
  createAppUpdateChecker,
  RUNNING_BUILD_ID,
  stripUpdateParam,
} from './appVersion';

export function useUpdateBlocker(active: boolean): void {
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    return blockAppUpdate();
  }, [active]);
}

export function useAppUpdate(): void {
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !RUNNING_BUILD_ID) return;

    stripUpdateParam();
    const checker = createAppUpdateChecker({
      runningBuildId: RUNNING_BUILD_ID,
      isVisible: () => document.visibilityState === 'visible',
    });
    void checker.probe(false);
    const onEvent = () => void checker.probe(true);
    document.addEventListener('visibilitychange', onEvent);
    window.addEventListener('pageshow', onEvent);
    return () => {
      checker.dispose();
      document.removeEventListener('visibilitychange', onEvent);
      window.removeEventListener('pageshow', onEvent);
    };
  }, []);
}
