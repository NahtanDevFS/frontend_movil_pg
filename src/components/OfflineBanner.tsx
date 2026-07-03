//Banner de estado "sin conexión"
// Componente de UI reutilizable (por ahora no está conectado a ningún layout). Muestra un aviso sutil
// cuando no hay conexión, para que el operador sepa que puede seguir trabajando pero que ciertos datos podrían no estar actualizados.

import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkStatus } from "../offline/useNetworkStatus";

export default function OfflineBanner() {
  const conectado = useNetworkStatus();

  if (conectado) return null;

  return (
    <View style={styles.wrap}>
      <Ionicons name="cloud-offline-outline" size={16} color="#7a5a1a" />
      <Text style={styles.texto}>
        Sin conexión — mostrando la última información guardada
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff3d6",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  texto: {
    color: "#7a5a1a",
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
});
