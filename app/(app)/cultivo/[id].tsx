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

type FiltroEstado = "todos" | "en_progreso" | "completado";

export default function CultivoDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const cultivoId = Number(id);

  const [cultivo, setCultivo] = useState<Cultivo | null>(null);
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const LIMIT = 20;

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const cargar = useCallback(
    async (resetear = true) => {
      const nuevoSkip = resetear ? 0 : skip;
      try {
        const [todosCultivos, listaConteos] = await Promise.all([
          getCultivos(),
          getConteosPorCultivo(cultivoId, {
            estado: filtroEstado === "todos" ? undefined : filtroEstado,
            fecha_desde: fechaDesde || undefined,
            fecha_hasta: fechaHasta || undefined,
            skip: nuevoSkip,
            limit: LIMIT,
          }),
        ]);
        const cult = todosCultivos.find((c) => c.id === cultivoId) ?? null;
        setCultivo(cult);
        if (cult) navigation.setOptions({ title: cult.nombre });
        if (resetear) {
          setConteos(listaConteos);
          setSkip(LIMIT);
        } else {
          setConteos((prev) => [...prev, ...listaConteos]);
          setSkip(nuevoSkip + LIMIT);
        }
        setHasMore(listaConteos.length === LIMIT);
      } catch {
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [cultivoId, filtroEstado, fechaDesde, fechaHasta, skip],
  );

  useEffect(() => {
    setLoading(true);
    setSkip(0);
    cargar(true);
  }, [cultivoId, filtroEstado, fechaDesde, fechaHasta]);

  const handleCargarMas = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    cargar(false);
  };

  const limpiarFiltros = () => {
    setFiltroEstado("todos");
    setFechaDesde("");
    setFechaHasta("");
  };

  const hayFiltros = filtroEstado !== "todos" || fechaDesde || fechaHasta;

  if (loading)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );

  return (
    <View style={styles.container}>
      {/* Header del cultivo */}
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

      {/* Barra de filtros */}
      <View style={styles.filtroBar}>
        <TouchableOpacity
          style={[
            styles.filtroToggle,
            mostrarFiltros && styles.filtroToggleActive,
          ]}
          onPress={() => setMostrarFiltros((v) => !v)}
        >
          <Ionicons
            name="funnel-outline"
            size={15}
            color={mostrarFiltros ? "#2d6a4f" : "#5a7a6a"}
          />
          <Text
            style={[
              styles.filtroToggleText,
              mostrarFiltros && { color: "#2d6a4f" },
            ]}
          >
            Filtros{hayFiltros ? " •" : ""}
          </Text>
        </TouchableOpacity>

        {/* Chips de estado */}
        <View style={styles.estadoChips}>
          {(["todos", "en_progreso", "completado"] as FiltroEstado[]).map(
            (e) => (
              <TouchableOpacity
                key={e}
                style={[styles.chip, filtroEstado === e && styles.chipActive]}
                onPress={() => setFiltroEstado(e)}
              >
                <Text
                  style={[
                    styles.chipText,
                    filtroEstado === e && styles.chipTextActive,
                  ]}
                >
                  {e === "todos"
                    ? "Todos"
                    : e === "en_progreso"
                      ? "En progreso"
                      : "Completados"}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </View>
      </View>

      {/* Panel de fechas expandible */}
      {mostrarFiltros && (
        <View style={styles.filtroPanelFechas}>
          <View style={styles.fechaRow}>
            <View style={styles.fechaField}>
              <Text style={styles.fechaLabel}>Desde</Text>
              <TouchableOpacity
                style={styles.fechaInput}
                onPress={() => {
                  /* En producción usar DateTimePicker */
                }}
              >
                <Text
                  style={
                    fechaDesde ? styles.fechaValor : styles.fechaPlaceholder
                  }
                >
                  {fechaDesde || "AAAA-MM-DD"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.fechaField}>
              <Text style={styles.fechaLabel}>Hasta</Text>
              <TouchableOpacity
                style={styles.fechaInput}
                onPress={() => {
                  /* En producción usar DateTimePicker */
                }}
              >
                <Text
                  style={
                    fechaHasta ? styles.fechaValor : styles.fechaPlaceholder
                  }
                >
                  {fechaHasta || "AAAA-MM-DD"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {hayFiltros && (
            <TouchableOpacity
              style={styles.btnLimpiar}
              onPress={limpiarFiltros}
            >
              <Text style={styles.btnLimpiarText}>Limpiar filtros</Text>
            </TouchableOpacity>
          )}
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
              cargar(true);
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
            <Text style={styles.emptyTitle}>Sin conteos</Text>
            <Text style={styles.emptySubtitle}>
              {hayFiltros
                ? "Ningún conteo coincide con los filtros aplicados."
                : "Inicia un conteo para subir videos del cultivo."}
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              size="small"
              color="#2d6a4f"
              style={{ marginVertical: 16 }}
            />
          ) : hasMore && conteos.length > 0 ? (
            <TouchableOpacity style={styles.btnMas} onPress={handleCargarMas}>
              <Text style={styles.btnMasText}>Cargar más</Text>
            </TouchableOpacity>
          ) : null
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
  // Filtros
  filtroBar: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#dde8e2",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filtroToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dde8e2",
    backgroundColor: "#f4f7f5",
  },
  filtroToggleActive: { borderColor: "#2d6a4f", backgroundColor: "#e8f5ee" },
  filtroToggleText: { fontSize: 12, fontWeight: "600", color: "#5a7a6a" },
  estadoChips: { flexDirection: "row", gap: 6, flex: 1 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dde8e2",
    backgroundColor: "#f4f7f5",
  },
  chipActive: { backgroundColor: "#e8f5ee", borderColor: "#2d6a4f" },
  chipText: { fontSize: 11, fontWeight: "600", color: "#5a7a6a" },
  chipTextActive: { color: "#2d6a4f" },
  filtroPanelFechas: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#dde8e2",
    gap: 10,
  },
  fechaRow: { flexDirection: "row", gap: 12 },
  fechaField: { flex: 1, gap: 4 },
  fechaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5a7a6a",
    textTransform: "uppercase",
  },
  fechaInput: {
    backgroundColor: "#f4f7f5",
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    borderRadius: 8,
    padding: 10,
  },
  fechaValor: { fontSize: 13, color: "#1a2e25", fontWeight: "600" },
  fechaPlaceholder: { fontSize: 13, color: "#a0b5a8" },
  btnLimpiar: { alignSelf: "flex-end" },
  btnLimpiarText: { fontSize: 12, fontWeight: "700", color: "#dc2626" },
  // Lista
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
  btnMas: {
    margin: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d6a4f",
    alignItems: "center",
  },
  btnMasText: { fontSize: 13, fontWeight: "700", color: "#2d6a4f" },
});
