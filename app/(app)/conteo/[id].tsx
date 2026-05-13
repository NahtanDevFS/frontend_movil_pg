import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
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
  getCalibresPorVariedad,
  guardarMuestreo,
} from "../../../src/api/endpoints";
import {
  Conteo,
  ProcesamientoVideo,
  MuestreoResponse,
  Cultivo,
  ComparacionAnterior,
  Calibre,
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
  const [calibres, setCalibres] = useState<Calibre[]>([]);
  const [loading, setLoading] = useState(true);
  const [completando, setCompletando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [showMuestreo, setShowMuestreo] = useState(false);
  const [totalMuestreo, setTotalMuestreo] = useState("100");
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [guardandoMuestreo, setGuardandoMuestreo] = useState(false);

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
        const cals = await getCalibresPorVariedad(c.variedad_id);
        setCalibres(cals);
      } catch {}
      try {
        const m = await getMuestreo(conteoId);
        if (m.clasificaciones.length) {
          setMuestreo(m);
          const prev: Record<number, string> = {};
          m.clasificaciones.forEach((cl) => {
            prev[cl.calibre_id] = String(cl.cantidad_muestreo);
          });
          setCantidades(prev);
          setTotalMuestreo(String(m.clasificaciones[0]?.total_muestreo ?? 100));
        }
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

  const handleGuardarMuestreo = async () => {
    if (!calibres.length) return;
    const total = parseInt(totalMuestreo);
    if (isNaN(total) || total <= 0) return Alert.alert("Total inválido");
    const items = calibres.map((c) => ({
      calibre_id: c.id,
      cantidad_muestreo: parseInt(cantidades[c.id] ?? "0") || 0,
    }));
    const suma = items.reduce((a, b) => a + b.cantidad_muestreo, 0);
    if (suma !== total)
      return Alert.alert(
        "Error",
        `La suma (${suma}) debe ser igual al total (${total}).`,
      );
    setGuardandoMuestreo(true);
    try {
      const m = await guardarMuestreo(conteoId, {
        total_muestreo: total,
        items,
      });
      setMuestreo(m);
      setShowMuestreo(false);
      Alert.alert("Muestreo guardado");
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.detail ?? "No se pudo guardar.");
    } finally {
      setGuardandoMuestreo(false);
    }
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
              style={styles.btnAgregar}
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
              <Ionicons name="cloud-upload-outline" size={16} color="#2d6a4f" />
              <Text style={styles.btnAgregarText}>Agregar video</Text>
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
      {conteo.conteo_total_acumulado > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Calibres</Text>
            {!completado && (
              <TouchableOpacity onPress={() => setShowMuestreo(true)}>
                <Text style={styles.addLink}>
                  {muestreo ? "Editar" : "+ Registrar"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {muestreo && muestreo.clasificaciones.length > 0 ? (
            muestreo.clasificaciones.map((c) => (
              <View key={c.calibre_id} style={styles.calibreRow}>
                <Text style={styles.calibreNombre}>{c.nombre_calibre}</Text>
                <Text style={styles.calibrePct}>
                  {c.porcentaje.toFixed(1)}%
                </Text>
                <Text style={styles.calibreTotal}>
                  {c.cantidad_extrapolada.toLocaleString()}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Sin muestreo registrado aún.</Text>
          )}
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

      {/* Modal muestreo */}
      <Modal
        visible={showMuestreo}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <ScrollView
          style={styles.modal}
          contentContainerStyle={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Muestreo por calibre</Text>
            <TouchableOpacity
              onPress={() => setShowMuestreo(false)}
              style={styles.modalClose}
            >
              <Ionicons name="close" size={22} color="#5a7a6a" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Total de melones muestreados</Text>
          <TextInput
            style={styles.input}
            value={totalMuestreo}
            onChangeText={setTotalMuestreo}
            keyboardType="number-pad"
            placeholder="Ej. 100"
            placeholderTextColor="#a0b5a8"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>
            Cantidad por calibre
          </Text>
          {calibres.map((c) => (
            <View key={c.id} style={styles.calibreInputRow}>
              <Text style={styles.calibreInputLabel}>{c.nombre}</Text>
              <TextInput
                style={[styles.input, { width: 80, textAlign: "center" }]}
                value={cantidades[c.id] ?? ""}
                onChangeText={(v) =>
                  setCantidades((prev) => ({ ...prev, [c.id]: v }))
                }
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#a0b5a8"
              />
            </View>
          ))}

          {(() => {
            const suma = calibres.reduce(
              (a, c) => a + (parseInt(cantidades[c.id] ?? "0") || 0),
              0,
            );
            const total = parseInt(totalMuestreo) || 0;
            const ok = suma === total && total > 0;
            return (
              <View
                style={[
                  styles.sumaIndicador,
                  { backgroundColor: ok ? "#d1fae5" : "#fff3cd" },
                ]}
              >
                <Ionicons
                  name={ok ? "checkmark-circle" : "alert-circle-outline"}
                  size={16}
                  color={ok ? "#065f46" : "#856404"}
                />
                <Text
                  style={{
                    color: ok ? "#065f46" : "#856404",
                    fontWeight: "700",
                  }}
                >
                  {suma} / {total} —{" "}
                  {ok
                    ? "Completo"
                    : suma < total
                      ? `Faltan ${total - suma}`
                      : `Excede en ${suma - total}`}
                </Text>
              </View>
            );
          })()}

          <TouchableOpacity
            style={[styles.btnPrimary, guardandoMuestreo && styles.btnDisabled]}
            onPress={handleGuardarMuestreo}
            disabled={guardandoMuestreo}
          >
            {guardandoMuestreo ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>Guardar muestreo</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </Modal>
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
  btnAgregar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#2d6a4f",
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  btnAgregarText: { color: "#2d6a4f", fontWeight: "700", fontSize: 14 },
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
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5a7a6a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#f4f7f5",
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#1a2e25",
  },
  btnPrimary: {
    backgroundColor: "#2d6a4f",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modal: { flex: 1, backgroundColor: "#fff" },
  modalContent: { padding: 24, gap: 12, paddingBottom: 48 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1a2e25" },
  modalClose: { padding: 4 },
  calibreInputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  calibreInputLabel: { fontSize: 15, fontWeight: "600", color: "#1a2e25" },
  sumaIndicador: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
});
