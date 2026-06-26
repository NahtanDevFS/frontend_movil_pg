import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { cambiarPasswordPropia } from "../../src/api/endpoints";

export default function CambiarPasswordScreen() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [nueva2, setNueva2] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (nueva.length < 6) {
      Alert.alert(
        "Contraseña muy corta",
        "La nueva contraseña debe tener al menos 6 caracteres.",
      );
      return;
    }
    if (nueva !== nueva2) {
      Alert.alert("Sin coincidencia", "Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    try {
      await cambiarPasswordPropia(actual, nueva);
      Alert.alert("Listo", "Tu contraseña se actualizó correctamente.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.response?.data?.detail ?? "No se pudo cambiar la contraseña.",
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Contraseña actual</Text>
      <TextInput
        style={styles.input}
        value={actual}
        onChangeText={setActual}
        secureTextEntry
        placeholder="Tu contraseña actual"
        placeholderTextColor="#9aa8a0"
      />

      <Text style={styles.label}>Nueva contraseña</Text>
      <TextInput
        style={styles.input}
        value={nueva}
        onChangeText={setNueva}
        secureTextEntry
        placeholder="Mínimo 6 caracteres"
        placeholderTextColor="#9aa8a0"
      />

      <Text style={styles.label}>Confirmar nueva contraseña</Text>
      <TextInput
        style={styles.input}
        value={nueva2}
        onChangeText={setNueva2}
        secureTextEntry
        placeholder="Repite la nueva contraseña"
        placeholderTextColor="#9aa8a0"
      />

      <TouchableOpacity
        style={[styles.boton, guardando && styles.botonDeshabilitado]}
        onPress={guardar}
        disabled={guardando || !actual || !nueva || !nueva2}
      >
        {guardando ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.botonTexto}>Guardar</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5a7a6a",
    marginBottom: 6,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d7e0db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1a2e25",
    marginBottom: 8,
  },
  boton: {
    backgroundColor: "#2d6a4f",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  botonDeshabilitado: { opacity: 0.6 },
  botonTexto: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
