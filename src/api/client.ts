import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const API_URL = Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:8000";

export const TOKEN_KEY = "meloncount_token";

const client = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

client.interceptors.request.use(async (config: AxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token && config.headers) {
    (config.headers as Record<string, string>).Authorization =
      `Bearer ${token}`;
  }
  return config as any;
});

// Callback para notificar sesión expirada sin importar AuthContext (evita un ciclo de imports).
let onSesionExpirada: (() => void) | null = null;

export function registrarHandlerSesionExpirada(handler: () => void) {
  onSesionExpirada = handler;
}

client.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      // Excluye /login: ahí un 401 es "credenciales incorrectas", no sesión expirada.
      const esLogin = error.config?.url?.includes("/login");
      if (!esLogin) {
        onSesionExpirada?.();
      }
    }
    return Promise.reject(error);
  },
);

export default client;
