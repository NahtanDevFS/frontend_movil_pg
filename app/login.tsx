import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/context/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!nombre.trim() || !password.trim()) {
      Alert.alert("Campos requeridos", "Ingresa tu usuario y contraseña.");
      return;
    }
    setLoading(true);
    try {
      await signIn(nombre.trim(), password);
    } catch (error: any) {
      const msg =
        error.response?.status === 401
          ? "Usuario o contraseña incorrectos."
          : (error.message ?? "Error al iniciar sesión. Verifica tu conexión.");
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Ionicons name="leaf" size={32} color="#ffffff" />
          </View>
          <Text style={styles.appName}>MelonCount</Text>
          <Text style={styles.appSubtitle}>Amadeo Export S.A.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar sesión</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Usuario</Text>
            <View style={styles.inputRow}>
              <Ionicons
                name="person-outline"
                size={16}
                color="#8fa898"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre de usuario"
                placeholderTextColor="#a0b5a8"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.inputRow}>
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color="#8fa898"
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Contraseña"
                placeholderTextColor="#a0b5a8"
                secureTextEntry={!mostrarPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setMostrarPassword((p) => !p)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={mostrarPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#8fa898"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Iniciar sesión</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Acceso exclusivo para operadores de campo
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#f4f7f5",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  header: { alignItems: "center", marginBottom: 32 },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#2d6a4f",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  appName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a2e25",
    letterSpacing: -0.3,
  },
  appSubtitle: { fontSize: 13, color: "#5a7a6a", marginTop: 3 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a2e25",
    marginBottom: 20,
  },
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5a7a6a",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f4f7f5",
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1a2e25",
  },
  eyeBtn: { padding: 4 },
  btn: {
    backgroundColor: "#2d6a4f",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  footer: {
    textAlign: "center",
    color: "#8fa898",
    fontSize: 12,
    marginTop: 24,
  },
});
