import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { login as apiLogin, getMe } from "../api/endpoints";
import { TOKEN_KEY } from "../api/client";

interface Usuario {
  id: number;
  nombre: string;
  rol_id: number;
  activo: boolean;
}

interface AuthContextType {
  user: Usuario | null;
  loading: boolean;
  signIn: (nombre: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  // Al arrancar la app: verificar si hay token guardado
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) {
          setLoading(false);
          return;
        }
        const userData = await getMe();
        setUser(userData);
      } catch {
        // Token inválido o expirado
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    };
    restoreSession();
  }, []);

  const signIn = async (nombre: string, password: string) => {
    const { access_token } = await apiLogin(nombre, password);
    await SecureStore.setItemAsync(TOKEN_KEY, access_token);
    const userData = await getMe();

    // La app móvil es solo para operadores
    if (userData.rol_id === undefined) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      throw new Error("No se pudo verificar el usuario.");
    }

    setUser(userData);
    router.replace("/(app)");
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setUser(null);
    router.replace("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
