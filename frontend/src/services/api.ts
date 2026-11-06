import { API_BASE_URL } from '../config/api';
import { ApiError, type ApiErrorData, NetworkError } from './apiError';

interface RequestOptions extends RequestInit {
  token?: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    ...fetchOptions.headers,
  };

  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  if (
    fetchOptions.body &&
    !(fetchOptions.body instanceof FormData) &&
    !(headers as Record<string, string>)['Content-Type']
  ) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorData: ApiErrorData | undefined;
      try {
        errorData = await response.json();
      } catch {
        errorData = undefined;
      }
      throw new ApiError(response.status, response.statusText, errorData);
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(endpoint: string, token?: string) =>
    request<T>(endpoint, { method: 'GET', token }),

  post: <T>(endpoint: string, body?: unknown, token?: string) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      token,
    }),

  put: <T>(endpoint: string, body?: unknown, token?: string) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
      token,
    }),

  delete: <T>(endpoint: string, token?: string) =>
    request<T>(endpoint, { method: 'DELETE', token }),
};
