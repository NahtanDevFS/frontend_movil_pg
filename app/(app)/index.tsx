import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getCultivos } from "../../src/api/endpoints";
import { Cultivo } from "../../src/types";
import { useAuth } from "../../src/context/AuthContext";

export default function CultivosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [cultivos, setCultivos] = useState<Cultivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      setError("");
      const data = await getCultivos();
      setCultivos(data);
    } catch {
      setError("No se pudieron cargar los cultivos. Verifica tu conexión.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
        <Text style={styles.loadingText}>Cargando cultivos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.greeting}>
        <Text style={styles.greetingLabel}>Bienvenido,</Text>
        <Text style={styles.greetingName}>{user?.nombre ?? "operador"}</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color="#991b1b" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={cargar}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={cultivos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              cargar();
            }}
            tintColor="#2d6a4f"
          />
        }
        ListHeaderComponent={
          <Text style={styles.listHeader}>
            {cultivos.length} cultivo{cultivos.length !== 1 ? "s" : ""} asignado
            {cultivos.length !== 1 ? "s" : ""}
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="leaf-outline" size={40} color="#b7e4c7" />
            <Text style={styles.emptyTitle}>Sin cultivos asignados</Text>
            <Text style={styles.emptySubtitle}>
              El administrador debe asignarte acceso a un cultivo.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/(app)/cultivo/${item.id}`)}
            activeOpacity={0.85}
          >
            <View style={styles.cardIconBox}>
              <Ionicons name="grid-outline" size={20} color="#2d6a4f" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardNombre}>{item.nombre}</Text>
              {item.ubicacion ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={12} color="#8fa898" />
                  <Text style={styles.metaText}>{item.ubicacion}</Text>
                </View>
              ) : null}
              <View style={styles.chipsRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    {item.total_surcos} surcos
                  </Text>
                </View>
                {item.hectareas ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{item.hectareas} ha</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#b7c9bf" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f5" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { color: "#5a7a6a", fontSize: 14 },
  greeting: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#dde8e2",
    backgroundColor: "#fff",
  },
  greetingLabel: {
    fontSize: 12,
    color: "#8fa898",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  greetingName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a2e25",
    marginTop: 2,
  },
  listHeader: {
    fontSize: 12,
    color: "#8fa898",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
    marginBottom: 12,
  },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#e8f5ee",
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: "700", color: "#1a2e25" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  metaText: { fontSize: 12, color: "#8fa898" },
  chipsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  chip: {
    backgroundColor: "#e8f5ee",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipText: { fontSize: 11, fontWeight: "600", color: "#2d6a4f" },
  emptyBox: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#1a2e25" },
  emptySubtitle: {
    fontSize: 13,
    color: "#5a7a6a",
    textAlign: "center",
    lineHeight: 19,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    padding: 12,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
  },
  errorText: { flex: 1, color: "#991b1b", fontSize: 13 },
  retryText: { color: "#2d6a4f", fontWeight: "700", fontSize: 13 },
});
