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

  const onRefresh = () => {
    setRefreshing(true);
    cargar();
  };

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
      {/* Saludo */}
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>
          Hola,{" "}
          <Text style={styles.greetingName}>{user?.nombre ?? "operador"}</Text>
        </Text>
        <Text style={styles.greetingSubtitle}>
          {cultivos.length} cultivo{cultivos.length !== 1 ? "s" : ""} asignado
          {cultivos.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={cargar} style={styles.retryBtn}>
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
            onRefresh={onRefresh}
            tintColor="#2d6a4f"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyTitle}>Sin cultivos asignados</Text>
            <Text style={styles.emptySubtitle}>
              El administrador debe asignarte acceso a un cultivo para comenzar.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/(app)/cultivo/${item.id}`)}
            activeOpacity={0.85}
          >
            <View style={styles.cardIcon}>
              <Text style={{ fontSize: 22 }}>🌾</Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardNombre}>{item.nombre}</Text>
              {item.ubicacion ? (
                <Text style={styles.cardUbicacion}>📍 {item.ubicacion}</Text>
              ) : null}
              <View style={styles.cardMeta}>
                <Text style={styles.metaChip}>{item.total_surcos} surcos</Text>
                {item.hectareas ? (
                  <Text style={styles.metaChip}>{item.hectareas} ha</Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
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
    paddingBottom: 12,
  },
  greetingText: { fontSize: 14, color: "#5a7a6a" },
  greetingName: { fontWeight: "700", color: "#1a2e25" },
  greetingSubtitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1a2e25",
    marginTop: 2,
  },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#e8f5ee",
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: { flex: 1 },
  cardNombre: { fontSize: 15, fontWeight: "700", color: "#1a2e25" },
  cardUbicacion: { fontSize: 12, color: "#5a7a6a", marginTop: 2 },
  cardMeta: { flexDirection: "row", gap: 6, marginTop: 6 },
  metaChip: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2d6a4f",
    backgroundColor: "#e8f5ee",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  chevron: { fontSize: 22, color: "#b7c9bf", fontWeight: "300" },
  emptyBox: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a2e25",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#5a7a6a",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  errorBox: {
    margin: 16,
    padding: 14,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    gap: 8,
  },
  errorText: { color: "#991b1b", fontSize: 13 },
  retryBtn: { alignSelf: "flex-start" },
  retryText: { color: "#2d6a4f", fontWeight: "700", fontSize: 13 },
});
