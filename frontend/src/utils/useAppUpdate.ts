import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  claimAutoReload,
  MINIMUM_PROBE_INTERVAL_MS,
  RUNNING_BUILD_ID,
  readServedBuildId,
  reloadForUpdate,
  shouldReload,
  stripUpdateParam,
} from './appVersion';

export function useAppUpdate(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || !RUNNING_BUILD_ID) return;

    stripUpdateParam();

    let lastEventProbe = 0;
    let probing = false;

    const probe = async (fromEvent: boolean) => {
      if (probing) return;
      if (document.visibilityState !== 'visible') return;
      if (
        fromEvent &&
        Date.now() - lastEventProbe < MINIMUM_PROBE_INTERVAL_MS
      ) {
        return;
      }
      probing = true;
      if (fromEvent) lastEventProbe = Date.now();
      try {
        const served = await readServedBuildId();
        if (
          served &&
          shouldReload(RUNNING_BUILD_ID, served) &&
          claimAutoReload(served)
        ) {
          reloadForUpdate(served);
        }
      } finally {
        probing = false;
      }
    };

    void probe(false);
    const onEvent = () => void probe(true);
    document.addEventListener('visibilitychange', onEvent);
    window.addEventListener('pageshow', onEvent);
    return () => {
      document.removeEventListener('visibilitychange', onEvent);
      window.removeEventListener('pageshow', onEvent);
    };
  }, []);
}
