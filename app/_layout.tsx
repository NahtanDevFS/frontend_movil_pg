import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { router, useSegments } from "expo-router";
import { View, ActivityIndicator } from "react-native";

// Guard de navegación: redirige según estado de auth
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const enLogin = segments[0] === "login";

    if (!user && !enLogin) {
      router.replace("/login");
    } else if (user && enLogin) {
      router.replace("/(app)");
    }
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#f4f7f5",
        }}
      >
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGuard>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthGuard>
    </AuthProvider>
  );
}
