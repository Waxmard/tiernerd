export interface ApiErrorData {
  detail?: unknown;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly data?: ApiErrorData;

  constructor(status: number, statusText: string, data?: ApiErrorData) {
    super(`${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Unable to reach the server. Check your connection and try again.');
    this.name = 'NetworkError';
  }
}

export const isNetworkError = (error: unknown): boolean =>
  error instanceof NetworkError;

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = error.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const messages = detail.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || !('msg' in entry)) return [];
        const { msg } = entry;
        return typeof msg === 'string' && msg.trim() ? [msg] : [];
      });
      if (messages.length) return messages.join(', ');
    }
    return fallback;
  }
  if (error instanceof NetworkError) {
    return error.message;
  }
  if (error instanceof TypeError) {
    return 'Unable to reach the server. Check your connection and try again.';
  }
  return fallback;
}
