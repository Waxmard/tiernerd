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
  options: { url?: string; fetchImpl?: typeof fetch } = {}
): Promise<string | null> {
  const { url = VERSION_URL, fetchImpl = fetch } = options;
  try {
    const response = await fetchImpl(url, { cache: 'no-store' });
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
