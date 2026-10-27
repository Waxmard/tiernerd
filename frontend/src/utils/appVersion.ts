// Build identity baked into the running bundle by the deploy workflow, and the
// build id served by the deployed site in /version.json. When they differ the
// open document is stale, which is the normal state of an installed PWA left
// running across a deploy.
export const RUNNING_BUILD_ID = process.env.EXPO_PUBLIC_BUILD_ID ?? '';

export const VERSION_URL = '/version.json';
export const MINIMUM_PROBE_INTERVAL_MS = 30_000;
const RELOAD_GUARD_KEY = 'tiernerd:update-reload:v1';

type BuildStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Pages' _redirects answers unknown paths with index.html, so a missing
// version.json arrives as HTML and must degrade to null, not to an update.
export function parseBuildId(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!('buildId' in parsed)) return null;
    const { buildId } = parsed;
    return typeof buildId === 'string' && buildId.length > 0 ? buildId : null;
  } catch {
    return null;
  }
}

export function shouldReload(running: string, served: string | null): boolean {
  return Boolean(running && served && running !== served);
}

export async function readServedBuildId(
  options: { fetchImpl?: typeof fetch } = {}
): Promise<string | null> {
  const { fetchImpl = fetch } = options;
  try {
    const response = await fetchImpl(VERSION_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    return parseBuildId(await response.text());
  } catch {
    return null;
  }
}

// One reload per served build id; the guard is what keeps a reload loop from
// firing when the served document still resolves to the old bundle.
export function claimAutoReload(
  served: string,
  storage?: BuildStorage
): boolean {
  try {
    const store = storage ?? sessionStorage;
    if (store.getItem(RELOAD_GUARD_KEY) === served) return false;
    store.setItem(RELOAD_GUARD_KEY, served);
    return true;
  } catch {
    return false;
  }
}

export function stripUpdateParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('v')) return;
  url.searchParams.delete('v');
  window.history.replaceState(
    window.history.state,
    '',
    url.pathname + url.search + url.hash
  );
}

// Cache-busted navigation rather than a plain reload: the stale copy is the
// document itself, not the module graph.
export function reloadForUpdate(served: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('v', served);
  window.location.replace(url.toString());
}

const updateBlockers = new Set<symbol>();
const unblockedListeners = new Set<() => void>();

export function blockAppUpdate(): () => void {
  const blocker = Symbol();
  updateBlockers.add(blocker);
  return () => {
    if (!updateBlockers.delete(blocker) || updateBlockers.size > 0) return;
    queueMicrotask(() => {
      if (updateBlockers.size === 0) {
        for (const listener of unblockedListeners) listener();
      }
    });
  };
}

export function createAppUpdateChecker({
  runningBuildId,
  isVisible,
  reload = reloadForUpdate,
  readBuildId = readServedBuildId,
  claimReload = claimAutoReload,
}: {
  runningBuildId: string;
  isVisible: () => boolean;
  reload?: (served: string) => void;
  readBuildId?: () => Promise<string | null>;
  claimReload?: (served: string) => boolean;
}) {
  let active = true;
  let pending: string | null = null;
  let probing = false;
  let lastEventProbe = 0;

  const attemptReload = () => {
    if (!active || !pending || !isVisible() || updateBlockers.size > 0)
      return false;
    const served = pending;
    pending = null;
    if (claimReload(served)) reload(served);
    return true;
  };
  unblockedListeners.add(attemptReload);

  return {
    probe: async (fromEvent: boolean) => {
      if (attemptReload() || !active || probing || !isVisible()) return;
      if (fromEvent && Date.now() - lastEventProbe < MINIMUM_PROBE_INTERVAL_MS)
        return;
      probing = true;
      if (fromEvent) lastEventProbe = Date.now();
      try {
        const served = await readBuildId();
        if (!active) return;
        if (served !== null)
          pending = shouldReload(runningBuildId, served) ? served : null;
        attemptReload();
      } finally {
        probing = false;
      }
    },
    dispose: () => {
      active = false;
      unblockedListeners.delete(attemptReload);
    },
  };
}
