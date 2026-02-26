import { API_BASE_URL } from '@env';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as Keychain from 'react-native-keychain';
import { TokenPair } from './user.types';

// ─── Token helpers ────────────────────────────────────────────────────────────

export const getTokens = async (): Promise<TokenPair | null> => {
  try {
    const credentials = await Keychain.getGenericPassword();
    if (!credentials) return null;
    return JSON.parse(credentials.password) as TokenPair;
  } catch {
    return null;
  }
};

export const saveTokens = async (tokens: TokenPair): Promise<void> => {
  await Keychain.setGenericPassword('user', JSON.stringify(tokens));
};

export const clearTokens = async (): Promise<void> => {
  await Keychain.resetGenericPassword();
};

// ─── Axios instance ───────────────────────────────────────────────────────────

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});

// Attach access token to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const tokens = await getTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

// ─── Refresh state (prevents parallel refresh storms) ────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

// ─── Response interceptor — auto-refresh on 401 ───────────────────────────────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh once per request
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      // Queue request until refresh finishes
      return new Promise((resolve) => {
        subscribeTokenRefresh((newAccessToken: string) => {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;

    try {
      const tokens = await getTokens();
      if (!tokens?.refreshToken) {
        throw new Error('No refresh token available');
      }

      const { data } = await axios.post<TokenPair>(
        `${API_BASE_URL}/user/refresh`,
        { oldRefreshToken: tokens.refreshToken },
      );

      await saveTokens(data);
      onRefreshed(data.accessToken);

      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      // Refresh failed — wipe tokens so the app can redirect to login
      await clearTokens();
      refreshSubscribers = [];
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);