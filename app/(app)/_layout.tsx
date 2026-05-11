import { Stack } from "expo-router";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";

export default function AppLayout() {
  const { signOut } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#2d6a4f",
        headerTitleStyle: { fontWeight: "700", color: "#1a2e25", fontSize: 16 },
        headerShadowVisible: false,
        headerBackTitle: "",
        headerBackButtonDisplayMode: "minimal",
        headerRight: () => (
          <TouchableOpacity
            onPress={signOut}
            style={{ marginRight: 4, padding: 6 }}
          >
            <Ionicons name="log-out-outline" size={22} color="#5a7a6a" />
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "Mis Cultivos" }} />
      <Stack.Screen name="cultivo/[id]" options={{ title: "Conteos" }} />
      <Stack.Screen name="conteo/nuevo" options={{ title: "Nuevo Conteo" }} />
      <Stack.Screen name="conteo/[id]" options={{ title: "Detalle" }} />
      <Stack.Screen
        name="procesamiento/[id]"
        options={{ title: "Resultado" }}
      />
    </Stack>
  );
}
