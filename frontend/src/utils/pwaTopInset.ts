import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// iOS draws its status-bar blur band over an installed PWA's page, and some
// devices report env(safe-area-inset-top) as 0 there. Screens already add
// insets.top, so this returns only the shortfall below the band.
export const PWA_TOP_INSET_FLOOR = 56;

const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  return (
    standalone ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
};

export function usePwaTopInset(): number {
  const insets = useSafeAreaInsets();
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') setStandalone(isStandalone());
  }, []);
  if (Platform.OS !== 'web' || !standalone) return 0;
  return Math.max(0, PWA_TOP_INSET_FLOOR - insets.top);
}
