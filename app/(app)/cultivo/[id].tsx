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
import { Ionicons } from "@expo/vector-icons";
import { getConteosPorCultivo, getCultivos } from "../../../src/api/endpoints";
import { Conteo, Cultivo } from "../../../src/types";

const CONF_COLOR: Record<string, string> = {
  alto: "#065f46",
  moderado: "#856404",
  bajo: "#991b1b",
};
const CONF_BG: Record<string, string> = {
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cultivoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );

  return (
    <View style={styles.container}>
      {cultivo && (
        <View style={styles.cultivoHeader}>
          <Text style={styles.cultivoNombre}>{cultivo.nombre}</Text>
          <View style={styles.metaRow}>
            {cultivo.ubicacion ? (
              <>
                <Ionicons
                  name="location-outline"
                  size={13}
                  color="rgba(255,255,255,0.7)"
                />
                <Text style={styles.metaText}>{cultivo.ubicacion}</Text>
              </>
            ) : null}
            <Ionicons
              name="grid-outline"
              size={13}
              color="rgba(255,255,255,0.7)"
            />
            <Text style={styles.metaText}>{cultivo.total_surcos} surcos</Text>
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
            onRefresh={() => {
              setRefreshing(true);
              cargar();
            }}
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
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.btnNuevoText}>Nuevo conteo</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={36} color="#b7e4c7" />
            <Text style={styles.emptyTitle}>Sin conteos aún</Text>
            <Text style={styles.emptySubtitle}>
              Inicia un conteo para subir videos del cultivo.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/(app)/conteo/${item.id}`)}
            activeOpacity={0.85}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardFecha}>
                {new Date(item.fecha_conteo).toLocaleDateString("es-GT", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
              {item.conteo_total_acumulado > 0 && (
                <Text style={styles.cardTotal}>
                  {item.conteo_total_acumulado.toLocaleString()}{" "}
                  <Text style={styles.cardTotalUnit}>melones</Text>
                </Text>
              )}
            </View>
            <View style={styles.cardRight}>
              {item.nivel_confiabilidad_agregado && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        CONF_BG[item.nivel_confiabilidad_agregado],
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: CONF_COLOR[item.nivel_confiabilidad_agregado] },
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
                  {item.estado_id === 2 ? "Completado" : "En progreso"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#b7c9bf" />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f5" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  cultivoHeader: { backgroundColor: "#2d6a4f", padding: 20 },
  cultivoNombre: { fontSize: 17, fontWeight: "700", color: "#fff" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaText: { fontSize: 12, color: "rgba(255,255,255,0.75)" },
  list: { padding: 16, gap: 10 },
  btnNuevo: {
    backgroundColor: "#2d6a4f",
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 4,
  },
  btnNuevoText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  cardLeft: { gap: 4 },
  cardFecha: { fontSize: 13, fontWeight: "600", color: "#1a2e25" },
  cardTotal: { fontSize: 22, fontWeight: "800", color: "#2d6a4f" },
  cardTotalUnit: { fontSize: 13, fontWeight: "400", color: "#5a7a6a" },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  emptyBox: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#1a2e25" },
  emptySubtitle: { fontSize: 13, color: "#5a7a6a", textAlign: "center" },
});
