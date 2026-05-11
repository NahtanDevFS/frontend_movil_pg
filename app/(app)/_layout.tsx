import { Stack } from "expo-router";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { useRouter } from "expo-router";

export default function AppLayout() {
  const { signOut } = useAuth();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#2d6a4f",
        headerTitleStyle: { fontWeight: "700", color: "#1a2e25" },
        headerShadowVisible: false,
        headerBackTitle: "",
        // Botón de logout en la esquina superior derecha
        headerRight: () => (
          <TouchableOpacity
            onPress={signOut}
            style={{ marginRight: 4, padding: 4 }}
          >
            <Ionicons name="log-out-outline" size={22} color="#5a7a6a" />
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "Mis Cultivos" }} />
      <Stack.Screen name="cultivo/[id]" options={{ title: "Conteos" }} />
      <Stack.Screen name="conteo/nuevo" options={{ title: "Nuevo Conteo" }} />
      <Stack.Screen name="conteo/[id]" options={{ title: "Detalle Conteo" }} />
      <Stack.Screen
        name="procesamiento/[id]"
        options={{ title: "Resultado" }}
      />
    </Stack>
  );
}
