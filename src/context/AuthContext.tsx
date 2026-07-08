import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { login as apiLogin, getMe } from "../api/endpoints";
import { TOKEN_KEY, registrarHandlerSesionExpirada } from "../api/client";

interface Usuario {
  id: number;
  nombre: string;
  debe_cambiar_password?: boolean;
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

  // al abrir la app: si hay token guardado, intentamos recuperar la sesion
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
        // el token estaba invalido o vencido, lo botamos
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

    // la app movil es pa operadores y tambien admins, solo chequeamos que el usuario venga bien
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

  // si cae un 401 en medio de la sesion, client.ts llama este handler pa limpiar el estado y mandar al login
  useEffect(() => {
    registrarHandlerSesionExpirada(() => {
      setUser(null);
      router.replace("/login");
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
