import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  getConteo,
  getProcesamientosPorConteo,
  getMuestreo,
  completarConteo,
  getCultivos,
  getComparacionAnterior,
} from "../../../src/api/endpoints";
import {
  Conteo,
  ProcesamientoVideo,
  MuestreoResponse,
  Cultivo,
  ComparacionAnterior,
} from "../../../src/types";

const CONF_BG: Record<string, string> = {
  alto: "#d1fae5",
  moderado: "#fff3cd",
  bajo: "#fee2e2",
};
const CONF_COLOR: Record<string, string> = {
  alto: "#065f46",
  moderado: "#856404",
  bajo: "#991b1b",
};

export default function ConteoDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conteoId = Number(id);
  const router = useRouter();

  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [cultivo, setCultivo] = useState<Cultivo | null>(null);
  const [procs, setProcs] = useState<ProcesamientoVideo[]>([]);
  const [muestreo, setMuestreo] = useState<MuestreoResponse | null>(null);
  const [comparacion, setComparacion] = useState<ComparacionAnterior | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [completando, setCompletando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [c, ps, cultivos] = await Promise.all([
        getConteo(conteoId),
        getProcesamientosPorConteo(conteoId),
        getCultivos(),
      ]);
      setConteo(c);
      setProcs(ps);
      setCultivo(cultivos.find((cu) => cu.id === c.cultivo_id) ?? null);
      try {
        const m = await getMuestreo(conteoId);
        if (m.clasificaciones.length) setMuestreo(m);
      } catch {}
      try {
        const comp = await getComparacionAnterior(conteoId);
        setComparacion(comp);
      } catch {}
    } catch {
      Alert.alert("Error", "No se pudo cargar el conteo.");
    } finally {
      setLoading(false);
    }
  }, [conteoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleCompletar = () => {
    Alert.alert("Marcar como completado", "Esta acción no se puede revertir.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Confirmar",
        style: "destructive",
        onPress: async () => {
          setCompletando(true);
          try {
            await completarConteo(conteoId);
            await cargar();
          } catch (err: any) {
            Alert.alert(
              "Error",
              err.response?.data?.detail ?? "No se pudo completar.",
            );
          } finally {
            setCompletando(false);
          }
        },
      },
    ]);
  };

  const handleGenerarPDF = async () => {
    if (!conteo || !cultivo) return;
    setGenerandoPdf(true);
    try {
      const videosHtml = procs
        .filter((p) => p.resultado)
        .map(
          (p) => `
        <tr><td>${p.surco_inicio}–${p.surco_fin}</td>
        <td>${p.resultado!.conteo_ia.toLocaleString()}</td>
        <td>${p.resultado!.conteo_ajustado?.toLocaleString() ?? "—"}</td>
        <td><b>${(p.resultado!.conteo_ajustado ?? p.resultado!.conteo_ia).toLocaleString()}</b></td></tr>`,
        )
        .join("");
      const calibresHtml = muestreo?.clasificaciones.length
        ? `
        <h3>Distribución por calibre</h3>
        <table>${muestreo.clasificaciones
          .map(
            (c) => `
          <tr><td>${c.nombre_calibre}</td><td>${c.porcentaje.toFixed(1)}%</td><td><b>${c.cantidad_extrapolada.toLocaleString()}</b></td></tr>`,
          )
          .join("")}
        </table>`
        : "";
      const html = `<html><body style="font-family:sans-serif;padding:32px;color:#1a2e25;max-width:600px;margin:0 auto">
        <div style="background:#2d6a4f;padding:20px;border-radius:10px;color:#fff;margin-bottom:24px">
          <h1 style="margin:0">MelonCount</h1>
          <p style="margin:4px 0 0;opacity:0.7;font-size:12px">Sistema de Conteo Pre-cosecha · Amadeo Export S.A.</p>
        </div>
        <h2 style="color:#2d6a4f">Reporte de Conteo #${conteoId}</h2>
        <p style="color:#5a7a6a">${cultivo.nombre}${cultivo.ubicacion ? " · " + cultivo.ubicacion : ""}</p>
        <div style="background:#f4f7f5;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
          <p style="margin:0;font-size:11px;color:#5a7a6a;text-transform:uppercase;letter-spacing:1px">Total acumulado</p>
          <p style="margin:4px 0;font-size:56px;font-weight:800;color:#2d6a4f">${conteo.conteo_total_acumulado.toLocaleString()}</p>
          <p style="margin:0;color:#5a7a6a">melones</p>
        </div>
        <h3>Videos procesados</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="background:#e8f5ee"><th>Surcos</th><th>Conteo IA</th><th>Ajustado</th><th>Efectivo</th></tr>
          ${videosHtml}
        </table>
        ${calibresHtml}
        <p style="color:#8fa898;font-size:11px;margin-top:40px;text-align:center">
          Generado por MelonCount · ${new Date().toLocaleString("es-GT")}
        </p></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        UTI: ".pdf",
      });
    } catch {
      Alert.alert("Error", "No se pudo generar el PDF.");
    } finally {
      setGenerandoPdf(false);
    }
  };

  if (loading)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );
  if (!conteo) return null;

  const completado = conteo.estado_id === 2;
  const nivel = conteo.nivel_confiabilidad_agregado;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        <View>
          <Text style={styles.heroLabel}>TOTAL ACUMULADO</Text>
          <Text style={styles.heroTotal}>
            {conteo.conteo_total_acumulado.toLocaleString()}
          </Text>
          <Text style={styles.heroSub}>
            {procs.length} video{procs.length !== 1 ? "s" : ""} procesado
            {procs.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.heroRight}>
          <View
            style={[
              styles.badge,
              { backgroundColor: completado ? "#d1fae5" : "#fff3cd" },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: completado ? "#065f46" : "#856404" },
              ]}
            >
              {completado ? "Completado" : "En progreso"}
            </Text>
          </View>
          {nivel && (
            <View
              style={[
                styles.badge,
                { backgroundColor: CONF_BG[nivel], marginTop: 6 },
              ]}
            >
              <Text style={[styles.badgeText, { color: CONF_COLOR[nivel] }]}>
                {nivel}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Comparación */}
      {comparacion?.hay_historial && (
        <View style={styles.comparCard}>
          <Text style={styles.comparLabel}>Ciclo anterior</Text>
          <View style={styles.comparRow}>
            <Text style={styles.comparTotal}>
              {comparacion.conteo_anterior_total?.toLocaleString()}
            </Text>
            {comparacion.variacion_porcentual != null && (
              <View style={styles.variacionRow}>
                <Ionicons
                  name={
                    comparacion.variacion_porcentual >= 0
                      ? "trending-up"
                      : "trending-down"
                  }
                  size={16}
                  color={
                    comparacion.variacion_porcentual >= 0
                      ? "#059669"
                      : "#dc2626"
                  }
                />
                <Text
                  style={[
                    styles.variacion,
                    {
                      color:
                        comparacion.variacion_porcentual >= 0
                          ? "#059669"
                          : "#dc2626",
                    },
                  ]}
                >
                  {Math.abs(comparacion.variacion_porcentual).toFixed(1)}%
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Videos */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Videos</Text>
          {!completado && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/(app)/conteo/nuevo",
                  params: {
                    cultivo_id: conteo.cultivo_id,
                    conteo_id: conteoId,
                  },
                })
              }
            >
              <Text style={styles.addLink}>+ Agregar</Text>
            </TouchableOpacity>
          )}
        </View>
        {procs.length === 0 ? (
          <Text style={styles.emptyText}>Sin videos procesados aún.</Text>
        ) : (
          procs.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.procRow}
              onPress={() => router.push(`/(app)/procesamiento/${p.id}`)}
            >
              <View>
                <Text style={styles.procSurcos}>
                  Surcos {p.surco_inicio}–{p.surco_fin}
                </Text>
                {p.resultado && (
                  <Text style={styles.procTotal}>
                    {(
                      p.resultado.conteo_ajustado ?? p.resultado.conteo_ia
                    ).toLocaleString()}{" "}
                    melones
                  </Text>
                )}
              </View>
              <View style={styles.procRight}>
                {p.resultado?.nivel_confiabilidad && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          CONF_BG[p.resultado.nivel_confiabilidad],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: CONF_COLOR[p.resultado.nivel_confiabilidad] },
                      ]}
                    >
                      {p.resultado.nivel_confiabilidad}
                    </Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color="#b7c9bf" />
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Calibres */}
      {muestreo && muestreo.clasificaciones.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calibres</Text>
          {muestreo.clasificaciones.map((c) => (
            <View key={c.calibre_id} style={styles.calibreRow}>
              <Text style={styles.calibreNombre}>{c.nombre_calibre}</Text>
              <Text style={styles.calibrePct}>{c.porcentaje.toFixed(1)}%</Text>
              <Text style={styles.calibreTotal}>
                {c.cantidad_extrapolada.toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Acciones */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.btnAction, generandoPdf && styles.btnDisabled]}
          onPress={handleGenerarPDF}
          disabled={generandoPdf}
        >
          <Ionicons name="document-text-outline" size={18} color="#2d6a4f" />
          <Text style={styles.btnActionText}>
            {generandoPdf ? "Generando..." : "Exportar reporte PDF"}
          </Text>
        </TouchableOpacity>
        {!completado && conteo.conteo_total_acumulado > 0 && (
          <TouchableOpacity
            style={[styles.btnCompletar, completando && styles.btnDisabled]}
            onPress={handleCompletar}
            disabled={completando}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={styles.btnCompletarText}>
              {completando ? "Completando..." : "Marcar como completado"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f5" },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  hero: {
    backgroundColor: "#2d6a4f",
    borderRadius: 14,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTotal: { fontSize: 48, fontWeight: "800", color: "#fff", lineHeight: 52 },
  heroSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  heroRight: { alignItems: "flex-end" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  comparCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#52b788",
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  comparLabel: {
    fontSize: 11,
    color: "#8fa898",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "700",
  },
  comparRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  comparTotal: { fontSize: 22, fontWeight: "800", color: "#1a2e25" },
  variacionRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  variacion: { fontSize: 14, fontWeight: "700" },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5a7a6a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addLink: { fontSize: 13, fontWeight: "700", color: "#2d6a4f" },
  emptyText: { fontSize: 13, color: "#8fa898" },
  procRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f7f5",
  },
  procSurcos: { fontSize: 13, fontWeight: "600", color: "#1a2e25" },
  procTotal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2d6a4f",
    marginTop: 2,
  },
  procRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  calibreRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f7f5",
  },
  calibreNombre: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1a2e25" },
  calibrePct: {
    fontSize: 13,
    color: "#52b788",
    fontWeight: "700",
    marginRight: 12,
  },
  calibreTotal: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1a2e25",
    minWidth: 70,
    textAlign: "right",
  },
  btnAction: {
    backgroundColor: "#f4f7f5",
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  btnActionText: { fontSize: 14, fontWeight: "600", color: "#1a2e25" },
  btnCompletar: {
    backgroundColor: "#2d6a4f",
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnCompletarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
});
