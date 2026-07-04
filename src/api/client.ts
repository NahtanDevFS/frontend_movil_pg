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

// Callback registrable para notificar que la sesión expiró. client.ts no
// puede importar AuthContext directamente (crearía un ciclo: AuthContext
// -> endpoints.ts -> client.ts -> AuthContext), así que en su lugar expone
// este punto de suscripción. AuthContext lo registra al montar, y así
// puede reaccionar (limpiar el usuario, navegar a /login) sin que este
// módulo necesite saber nada de React ni de navegación.
let onSesionExpirada: (() => void) | null = null;

export function registrarHandlerSesionExpirada(handler: () => void) {
  onSesionExpirada = handler;
}

client.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      // Excluye /login: ahí un 401 significa "credenciales incorrectas",
      // no "sesión expirada" — no tiene sentido notificar una sesión rota
      // que nunca llegó a existir, y el formulario de login ya maneja ese
      // error por su cuenta.
      const esLogin = error.config?.url?.includes("/login");
      if (!esLogin) {
        onSesionExpirada?.();
      }
    }
    return Promise.reject(error);
  },
);

export default client;
