import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const API_URL = Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:8000";

export const TOKEN_KEY = "meloncount_token";

const client = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30s — los uploads de video pueden tardar
  headers: {
    "Content-Type": "application/json",
  },
});

// Inyectar token en cada request
client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor de respuesta — manejar 401 globalmente
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
    return Promise.reject(error);
  },
);

export default client;
