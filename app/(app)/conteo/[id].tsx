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

const CONF_BG = { alto: "#d1fae5", moderado: "#fff3cd", bajo: "#fee2e2" };
const CONF_COLOR = { alto: "#065f46", moderado: "#856404", bajo: "#991b1b" };

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
        if (m.clasificaciones.length > 0) setMuestreo(m);
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

  const handleCompletar = async () => {
    if (!conteo) return;
    Alert.alert(
      "Marcar como completado",
      "¿Estás seguro? El conteo no se podrá reabrir.",
      [
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
                err.response?.data?.detail ?? "No se pudo completar el conteo.",
              );
            } finally {
              setCompletando(false);
            }
          },
        },
      ],
    );
  };

  const handleGenerarPDF = async () => {
    if (!conteo || !cultivo) return;
    setGenerandoPdf(true);
    try {
      let calibresHtml = "";
      if (muestreo?.clasificaciones.length) {
        calibresHtml = `
          <h3 style="color:#2d6a4f;margin-top:24px">Distribución por calibre</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#e8f5ee">
              <th style="padding:8px;text-align:left">Calibre</th>
              <th style="padding:8px;text-align:right">Muestreo</th>
              <th style="padding:8px;text-align:right">%</th>
              <th style="padding:8px;text-align:right">Extrapolado</th>
            </tr></thead>
            <tbody>
              ${muestreo.clasificaciones
                .map(
                  (c) => `
                <tr style="border-top:1px solid #dde8e2">
                  <td style="padding:8px">${c.nombre_calibre}</td>
                  <td style="padding:8px;text-align:right">${c.cantidad_muestreo}/${c.total_muestreo}</td>
                  <td style="padding:8px;text-align:right">${c.porcentaje.toFixed(1)}%</td>
                  <td style="padding:8px;text-align:right;font-weight:700">${c.cantidad_extrapolada.toLocaleString()}</td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>`;
      }

      const videosHtml = procs
        .filter((p) => p.resultado)
        .map(
          (p) => `
        <tr style="border-top:1px solid #dde8e2">
          <td style="padding:8px">S${p.surco_inicio}–${p.surco_fin}</td>
          <td style="padding:8px;text-align:right">${p.resultado!.conteo_ia.toLocaleString()}</td>
          <td style="padding:8px;text-align:right">${p.resultado!.conteo_ajustado?.toLocaleString() ?? "—"}</td>
          <td style="padding:8px;text-align:right;font-weight:700">${(p.resultado!.conteo_ajustado ?? p.resultado!.conteo_ia).toLocaleString()}</td>
        </tr>`,
        )
        .join("");

      const html = `
        <html><body style="font-family:sans-serif;padding:32px;color:#1a2e25;max-width:600px;margin:0 auto">
          <div style="background:#2d6a4f;padding:20px;border-radius:10px;color:#fff;margin-bottom:24px">
            <h1 style="margin:0;font-size:22px">MelonCount</h1>
            <p style="margin:4px 0 0;opacity:0.75;font-size:12px">Sistema de Conteo Pre-cosecha · Amadeo Export S.A.</p>
          </div>
          <h2 style="color:#2d6a4f">Reporte de Conteo #${conteoId}</h2>
          <p style="color:#5a7a6a;font-size:13px">${cultivo.nombre}${cultivo.ubicacion ? " · " + cultivo.ubicacion : ""}</p>
          <p style="color:#5a7a6a;font-size:13px">Fecha: ${new Date(conteo.fecha_conteo).toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" })}</p>
          <div style="background:#f4f7f5;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
            <p style="margin:0;font-size:11px;color:#5a7a6a;letter-spacing:1px">TOTAL ACUMULADO</p>
            <p style="margin:4px 0;font-size:56px;font-weight:800;color:#2d6a4f">${conteo.conteo_total_acumulado.toLocaleString()}</p>
            <p style="margin:0;color:#5a7a6a">melones</p>
          </div>
          <h3 style="color:#2d6a4f">Videos procesados</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#e8f5ee">
              <th style="padding:8px;text-align:left">Surcos</th>
              <th style="padding:8px;text-align:right">Conteo IA</th>
              <th style="padding:8px;text-align:right">Ajustado</th>
              <th style="padding:8px;text-align:right">Efectivo</th>
            </tr></thead>
            <tbody>${videosHtml}</tbody>
          </table>
          ${calibresHtml}
          <p style="color:#8fa898;font-size:11px;margin-top:40px;text-align:center">
            Generado por MelonCount · ${new Date().toLocaleString("es-GT")}
          </p>
        </body></html>`;

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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );
  }

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
            melones · {procs.length} video{procs.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.heroRight}>
          <View
            style={[
              styles.estadoBadge,
              { backgroundColor: completado ? "#d1fae5" : "#fff3cd" },
            ]}
          >
            <Text
              style={[
                styles.estadoText,
                { color: completado ? "#065f46" : "#856404" },
              ]}
            >
              {completado ? "Completado" : "En progreso"}
            </Text>
          </View>
          {nivel && (
            <View
              style={[
                styles.estadoBadge,
                { backgroundColor: CONF_BG[nivel], marginTop: 6 },
              ]}
            >
              <Text style={[styles.estadoText, { color: CONF_COLOR[nivel] }]}>
                {nivel}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Comparación anterior */}
      {comparacion?.hay_historial && (
        <View style={styles.comparCard}>
          <Text style={styles.comparLabel}>Ciclo anterior</Text>
          <View style={styles.comparRow}>
            <Text style={styles.comparTotal}>
              {comparacion.conteo_anterior_total?.toLocaleString()}
            </Text>
            {comparacion.variacion_porcentual != null && (
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
                {comparacion.variacion_porcentual >= 0 ? "▲" : "▼"}{" "}
                {Math.abs(comparacion.variacion_porcentual).toFixed(1)}%
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Videos */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Videos procesados</Text>
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
              <Text style={styles.addLink}>+ Agregar video</Text>
            </TouchableOpacity>
          )}
        </View>

        {procs.length === 0 ? (
          <Text style={styles.emptyText}>Sin videos aún.</Text>
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
                      styles.estadoBadge,
                      {
                        backgroundColor:
                          CONF_BG[p.resultado.nivel_confiabilidad],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.estadoText,
                        { color: CONF_COLOR[p.resultado.nivel_confiabilidad] },
                      ]}
                    >
                      {p.resultado.nivel_confiabilidad}
                    </Text>
                  </View>
                )}
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Distribución calibres */}
      {muestreo && muestreo.clasificaciones.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Distribución por calibre</Text>
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
          {generandoPdf ? (
            <ActivityIndicator size="small" color="#2d6a4f" />
          ) : null}
          <Text style={styles.btnActionText}>
            {generandoPdf ? "Generando..." : "📄 Exportar reporte PDF"}
          </Text>
        </TouchableOpacity>

        {!completado && conteo.conteo_total_acumulado > 0 && (
          <TouchableOpacity
            style={[styles.btnCompletar, completando && styles.btnDisabled]}
            onPress={handleCompletar}
            disabled={completando}
          >
            {completando ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : null}
            <Text style={styles.btnCompletarText}>
              {completando
                ? "Completando..."
                : "✓ Marcar conteo como completado"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f5" },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  hero: {
    backgroundColor: "#2d6a4f",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTotal: { fontSize: 48, fontWeight: "800", color: "#fff", lineHeight: 52 },
  heroSub: { fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  heroRight: { alignItems: "flex-end" },
  estadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  estadoText: { fontSize: 11, fontWeight: "700" },
  comparCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#52b788",
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
  variacion: { fontSize: 15, fontWeight: "700" },
  section: { backgroundColor: "#fff", borderRadius: 14, padding: 16, gap: 10 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#3d5a4a",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  addLink: { fontSize: 13, fontWeight: "700", color: "#2d6a4f" },
  emptyText: { fontSize: 13, color: "#8fa898", fontStyle: "italic" },
  procRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f7f5",
  },
  procSurcos: { fontSize: 14, fontWeight: "600", color: "#1a2e25" },
  procTotal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2d6a4f",
    marginTop: 2,
  },
  procRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  chevron: { fontSize: 20, color: "#b7c9bf" },
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
    fontSize: 15,
    fontWeight: "800",
    color: "#1a2e25",
    minWidth: 70,
    textAlign: "right",
  },
  btnAction: {
    backgroundColor: "#f4f7f5",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#dde8e2",
  },
  btnActionText: { fontSize: 14, fontWeight: "600", color: "#1a2e25" },
  btnCompletar: {
    backgroundColor: "#2d6a4f",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnCompletarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});
