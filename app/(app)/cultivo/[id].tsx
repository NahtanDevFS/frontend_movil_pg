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
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { getConteosPorCultivo, getCultivos } from "../../../src/api/endpoints";
import { Conteo, Cultivo } from "../../../src/types";

const ESTADO_LABEL: Record<number, string> = {
  1: "En progreso",
  2: "Completado",
};

const CONFIABILIDAD_COLOR: Record<string, string> = {
  alto: "#065f46",
  moderado: "#856404",
  bajo: "#991b1b",
};

const CONFIABILIDAD_BG: Record<string, string> = {
  alto: "#d1fae5",
  moderado: "#fff3cd",
  bajo: "#fee2e2",
};

export default function CultivoDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const cultivoId = Number(id);

  const [cultivo, setCultivo] = useState<Cultivo | null>(null);
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [todosCultivos, listaConteos] = await Promise.all([
        getCultivos(),
        getConteosPorCultivo(cultivoId),
      ]);
      const cult = todosCultivos.find((c) => c.id === cultivoId) ?? null;
      setCultivo(cult);
      setConteos(listaConteos);
      if (cult) navigation.setOptions({ title: cult.nombre });
    } catch {
      // Manejar error silenciosamente — FlatList mostrará vacío
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cultivoId]);

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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Info del cultivo */}
      {cultivo && (
        <View style={styles.cultivoInfo}>
          <Text style={styles.cultivoNombre}>{cultivo.nombre}</Text>
          <View style={styles.cultivoMeta}>
            {cultivo.ubicacion ? (
              <Text style={styles.metaText}>📍 {cultivo.ubicacion}</Text>
            ) : null}
            <Text style={styles.metaText}>
              🌾 {cultivo.total_surcos} surcos
            </Text>
            {cultivo.hectareas ? (
              <Text style={styles.metaText}>{cultivo.hectareas} ha</Text>
            ) : null}
          </View>
        </View>
      )}

      <FlatList
        data={conteos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2d6a4f"
          />
        }
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.btnNuevo}
            onPress={() =>
              router.push({
                pathname: "/(app)/conteo/nuevo",
                params: { cultivo_id: cultivoId },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.btnNuevoText}>+ Nuevo conteo</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>Sin conteos aún</Text>
            <Text style={styles.emptySubtitle}>
              Inicia un nuevo conteo para subir videos del cultivo.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/(app)/conteo/${item.id}`)}
            activeOpacity={0.85}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardFecha}>
                {new Date(item.fecha_conteo).toLocaleDateString("es-GT", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
              <View style={styles.badgeRow}>
                {item.nivel_confiabilidad_agregado && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          CONFIABILIDAD_BG[item.nivel_confiabilidad_agregado],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color:
                            CONFIABILIDAD_COLOR[
                              item.nivel_confiabilidad_agregado
                            ],
                        },
                      ]}
                    >
                      {item.nivel_confiabilidad_agregado}
                    </Text>
                  </View>
                )}
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        item.estado_id === 2 ? "#d1fae5" : "#fff3cd",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: item.estado_id === 2 ? "#065f46" : "#856404" },
                    ]}
                  >
                    {ESTADO_LABEL[item.estado_id] ?? "Desconocido"}
                  </Text>
                </View>
              </View>
            </View>
            {item.conteo_total_acumulado > 0 && (
              <Text style={styles.cardTotal}>
                {item.conteo_total_acumulado.toLocaleString()} melones
              </Text>
            )}
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f5" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  cultivoInfo: {
    backgroundColor: "#2d6a4f",
    padding: 20,
    paddingBottom: 24,
  },
  cultivoNombre: { fontSize: 18, fontWeight: "800", color: "#fff" },
  cultivoMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  metaText: { fontSize: 12, color: "rgba(255,255,255,0.75)" },
  list: { padding: 16, gap: 10 },
  btnNuevo: {
    backgroundColor: "#2d6a4f",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  btnNuevoText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardFecha: { fontSize: 14, fontWeight: "600", color: "#1a2e25" },
  badgeRow: { flexDirection: "row", gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardTotal: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2d6a4f",
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
  chevron: {
    position: "absolute",
    right: 16,
    top: "50%",
    fontSize: 22,
    color: "#b7c9bf",
  },
  emptyBox: { alignItems: "center", paddingTop: 40, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a2e25",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#5a7a6a",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
});
