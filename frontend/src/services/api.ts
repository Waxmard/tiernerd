import { API_BASE_URL } from '../config/api';
import { ApiError, type ApiErrorData } from './apiError';

interface RequestOptions extends RequestInit {
  token?: string;
}

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

  // Set Content-Type if not already set and body exists
  if (
    fetchOptions.body &&
    !(headers as Record<string, string>)['Content-Type']
  ) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
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

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(endpoint: string, token?: string) =>
    request<T>(endpoint, { method: 'GET', token }),

  post: <T>(endpoint: string, body?: unknown, token?: string) => {
    const isFormData = body instanceof URLSearchParams;
    return request<T>(endpoint, {
      method: 'POST',
      body: isFormData ? body.toString() : JSON.stringify(body),
      headers: isFormData
        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
        : undefined,
      token,
    });
  },

  put: <T>(endpoint: string, body?: unknown, token?: string) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      token,
    }),

  delete: <T>(endpoint: string, token?: string) =>
    request<T>(endpoint, { method: 'DELETE', token }),
};
