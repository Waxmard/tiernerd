export const RESTORE_TTL_MS = 24 * 60 * 60 * 1000;

export const restoreNavKey = (userId: string) => `restoreNav:v1:${userId}`;
export const restoreViewKey = (userId: string) => `restoreView:v1:${userId}`;

const ROUTE_NAMES = ['Main', 'Profile', 'ListDetail'];

interface SnapshotRoute {
  name: string;
  params?: { listId: string; listTitle: string };
}

const isFresh = (savedAt: unknown, now: number) =>
  typeof savedAt === 'number' &&
  Number.isFinite(savedAt) &&
  now - savedAt >= 0 &&
  now - savedAt <= RESTORE_TTL_MS;

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function buildNavSnapshot(
  state: { routes: { name: string; params?: object }[] },
  now: number
): string {
  const routes: SnapshotRoute[] = [];
  for (const route of state.routes) {
    if (!ROUTE_NAMES.includes(route.name)) continue;
    const params = route.params as
      | { listId?: unknown; listTitle?: unknown }
      | undefined;
    if (
      route.name === 'ListDetail' &&
      typeof params?.listId === 'string' &&
      typeof params.listTitle === 'string'
    ) {
      routes.push({
        name: route.name,
        params: { listId: params.listId, listTitle: params.listTitle },
      });
    } else {
      routes.push({ name: route.name });
    }
  }
  return JSON.stringify({ savedAt: now, routes });
}

export function parseNavSnapshot(
  raw: string | null,
  now: number
): { routes: SnapshotRoute[] } | undefined {
  const data = parseJson(raw);
  if (!data || !isFresh(data.savedAt, now)) return undefined;
  const { routes } = data;
  if (!Array.isArray(routes) || routes.length === 0) return undefined;
  const clean: SnapshotRoute[] = [];
  for (const route of routes) {
    const name = route?.name;
    if (!ROUTE_NAMES.includes(name)) return undefined;
    if (name === 'ListDetail') {
      const { listId, listTitle } = route.params ?? {};
      if (typeof listId !== 'string' || typeof listTitle !== 'string')
        return undefined;
      clean.push({ name, params: { listId, listTitle } });
    } else {
      clean.push({ name });
    }
  }
  return clean[0]?.name === 'Main' ? { routes: clean } : undefined;
}

export function buildListView(
  view: { listId: string; selectedItemId: string | null; offset: number },
  now: number
): string {
  return JSON.stringify({ savedAt: now, ...view });
}

export function parseListView(
  raw: string | null,
  listId: string,
  now: number
): { selectedItemId: string | null; offset: number } | null {
  const data = parseJson(raw);
  if (!data || !isFresh(data.savedAt, now) || data.listId !== listId)
    return null;
  const { selectedItemId, offset } = data;
  if (selectedItemId !== null && typeof selectedItemId !== 'string')
    return null;
  if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0)
    return null;
  return { selectedItemId, offset };
}
