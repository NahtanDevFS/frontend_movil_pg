import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as SecureStore from "expo-secure-store";
import {
  getProcesamiento,
  ajustarConteo,
  getConteo,
  getCalibresPorVariedad,
  guardarMuestreo,
  getMuestreo,
  getComparacionAnterior,
} from "../../../src/api/endpoints";
import { TOKEN_KEY } from "../../../src/api/client";
import {
  ProcesamientoVideo,
  Conteo,
  Calibre,
  MuestreoResponse,
  ComparacionAnterior,
} from "../../../src/types";
import Constants from "expo-constants";

const API_URL = Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:8000";

const CONF_COLOR = { alto: "#065f46", moderado: "#856404", bajo: "#991b1b" };
const CONF_BG = { alto: "#d1fae5", moderado: "#fff3cd", bajo: "#fee2e2" };
const CONF_LABEL = {
  alto: "Alta confiabilidad",
  moderado: "Confiabilidad moderada",
  bajo: "Baja confiabilidad",
};

export default function ProcesamientoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const procId = Number(id);
  const router = useRouter();

  const [proc, setProc] = useState<ProcesamientoVideo | null>(null);
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [calibres, setCalibres] = useState<Calibre[]>([]);
  const [muestreo, setMuestreo] = useState<MuestreoResponse | null>(null);
  const [comparacion, setComparacion] = useState<ComparacionAnterior | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ajuste de conteo
  const [conteoAjustado, setConteoAjustado] = useState("");
  const [obsAjuste, setObsAjuste] = useState("");
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);

  // Muestreo por calibre
  const [showMuestreo, setShowMuestreo] = useState(false);
  const [totalMuestreo, setTotalMuestreo] = useState("100");
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [guardandoMuestreo, setGuardandoMuestreo] = useState(false);

  // Descarga / PDF
  const [descargando, setDescargando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const p = await getProcesamiento(procId);
      setProc(p);

      if (p.resultado) {
        // Procesamiento terminado — cargar datos adicionales
        setProcesando(false);
        if (pollRef.current) clearInterval(pollRef.current);

        const c = await getConteo(p.conteo_id);
        setConteo(c);
        setConteoAjustado(
          String(p.resultado.conteo_ajustado ?? p.resultado.conteo_ia),
        );

        const [cals, comp] = await Promise.all([
          getCalibresPorVariedad(c.variedad_id),
          getComparacionAnterior(c.id).catch(() => null),
        ]);
        setCalibres(cals);
        if (comp) setComparacion(comp);

        try {
          const m = await getMuestreo(c.id);
          if (m.clasificaciones.length > 0) setMuestreo(m);
        } catch {}
      } else {
        // Aún procesando
        setProcesando(true);
      }
    } catch {
      Alert.alert("Error", "No se pudo cargar el resultado.");
    } finally {
      setLoading(false);
    }
  }, [procId]);

  useEffect(() => {
    cargar();
    // Polling cada 4 segundos mientras procesa
    pollRef.current = setInterval(() => {
      if (procesando) cargar();
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [cargar, procesando]);

  const handleGuardarAjuste = async () => {
    if (!proc) return;
    const valor = parseInt(conteoAjustado);
    if (isNaN(valor) || valor < 0)
      return Alert.alert(
        "Valor inválido",
        "Ingresa un número mayor o igual a 0.",
      );
    setGuardandoAjuste(true);
    try {
      await ajustarConteo(procId, {
        conteo_ajustado: valor,
        observaciones: obsAjuste,
      });
      await cargar();
      Alert.alert("✓ Ajuste guardado");
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.response?.data?.detail ?? "No se pudo guardar el ajuste.",
      );
    } finally {
      setGuardandoAjuste(false);
    }
  };

  const handleGuardarMuestreo = async () => {
    if (!conteo || !calibres.length) return;
    const total = parseInt(totalMuestreo);
    if (isNaN(total) || total <= 0) return Alert.alert("Total inválido");

    const items = calibres.map((c) => ({
      calibre_id: c.id,
      cantidad_muestreo: parseInt(cantidades[c.id] ?? "0") || 0,
    }));
    const suma = items.reduce((a, b) => a + b.cantidad_muestreo, 0);
    if (suma !== total) {
      return Alert.alert(
        "Error",
        `La suma (${suma}) debe ser igual al total del muestreo (${total}).`,
      );
    }

    setGuardandoMuestreo(true);
    try {
      const m = await guardarMuestreo(conteo.id, {
        total_muestreo: total,
        items,
      });
      setMuestreo(m);
      setShowMuestreo(false);
      Alert.alert("✓ Muestreo guardado");
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.response?.data?.detail ?? "No se pudo guardar el muestreo.",
      );
    } finally {
      setGuardandoMuestreo(false);
    }
  };

  const handleDescargarVideo = async () => {
    if (!proc?.video_anotado_url)
      return Alert.alert(
        "Sin video",
        "El video anotado no está disponible aún.",
      );
    setDescargando(true);
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const destino =
        FileSystem.documentDirectory + `conteo_video_${procId}.mp4`;
      const { uri } = await FileSystem.downloadAsync(
        `${API_URL}/procesamientos/${procId}/video-anotado`,
        destino,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await Sharing.shareAsync(uri);
    } catch {
      Alert.alert("Error", "No se pudo descargar el video.");
    } finally {
      setDescargando(false);
    }
  };

  const handleGenerarPDF = async () => {
    if (!proc || !conteo) return;
    setGenerandoPdf(true);
    try {
      const total =
        proc.resultado?.conteo_ajustado ?? proc.resultado?.conteo_ia ?? 0;
      const nivel = proc.resultado?.nivel_confiabilidad ?? "—";
      const conf = proc.resultado?.promedio_confianza
        ? `${(proc.resultado.promedio_confianza * 100).toFixed(1)}%`
        : "—";

      let calibresHtml = "";
      if (muestreo && muestreo.clasificaciones.length > 0) {
        calibresHtml = `
          <h3 style="color:#2d6a4f;margin-top:24px">Distribución por calibre</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#e8f5ee">
                <th style="padding:8px;text-align:left">Calibre</th>
                <th style="padding:8px;text-align:right">Muestreo</th>
                <th style="padding:8px;text-align:right">%</th>
                <th style="padding:8px;text-align:right">Extrapolado</th>
              </tr>
            </thead>
            <tbody>
              ${muestreo.clasificaciones
                .map(
                  (c) => `
                <tr style="border-top:1px solid #dde8e2">
                  <td style="padding:8px">${c.nombre_calibre}</td>
                  <td style="padding:8px;text-align:right">${c.cantidad_muestreo}/${c.total_muestreo}</td>
                  <td style="padding:8px;text-align:right">${c.porcentaje.toFixed(1)}%</td>
                  <td style="padding:8px;text-align:right;font-weight:700">${c.cantidad_extrapolada.toLocaleString()}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>`;
      }

      const html = `
        <html><body style="font-family:sans-serif;padding:32px;color:#1a2e25;max-width:600px;margin:0 auto">
          <div style="background:#2d6a4f;padding:20px;border-radius:10px;color:#fff;margin-bottom:24px">
            <h1 style="margin:0;font-size:22px">MelonCount</h1>
            <p style="margin:4px 0 0;opacity:0.75;font-size:12px">Sistema de Conteo Pre-cosecha · Amadeo Export S.A.</p>
          </div>
          <h2 style="color:#2d6a4f">Reporte de Procesamiento #${procId}</h2>
          <p style="color:#5a7a6a;font-size:13px">Conteo #${conteo.id} · Surcos ${proc.surco_inicio}–${proc.surco_fin}</p>
          <div style="background:#f4f7f5;border-radius:10px;padding:16px;margin:20px 0">
            <p style="margin:0;font-size:13px;color:#5a7a6a">TOTAL DETECTADO</p>
            <p style="margin:4px 0;font-size:48px;font-weight:800;color:#2d6a4f">${total.toLocaleString()}</p>
            <p style="margin:0;color:#5a7a6a;font-size:13px">melones</p>
          </div>
          <table style="width:100%;font-size:13px;margin-bottom:20px">
            <tr><td style="padding:6px 0;color:#5a7a6a">Confianza promedio</td><td style="text-align:right;font-weight:600">${conf}</td></tr>
            <tr><td style="padding:6px 0;color:#5a7a6a">Nivel de confiabilidad</td><td style="text-align:right;font-weight:600">${nivel}</td></tr>
            <tr><td style="padding:6px 0;color:#5a7a6a">Conteo IA original</td><td style="text-align:right">${proc.resultado?.conteo_ia.toLocaleString()}</td></tr>
            ${proc.resultado?.conteo_ajustado != null ? `<tr><td style="padding:6px 0;color:#5a7a6a">Conteo ajustado</td><td style="text-align:right;font-weight:600">${proc.resultado.conteo_ajustado.toLocaleString()}</td></tr>` : ""}
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
        <Text style={styles.loadingText}>Cargando resultado...</Text>
      </View>
    );
  }

  // ── Procesando (polling) ──────────────────────────────────
  if (procesando || !proc?.resultado) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
        <Text style={styles.procesandoTitle}>Procesando video con IA</Text>
        <Text style={styles.procesandoSub}>
          El modelo está analizando los frames del video. Esto puede tomar
          varios minutos dependiendo de la duración del video.
        </Text>
        <Text style={styles.procesandoHint}>
          Esta pantalla se actualiza automáticamente.
        </Text>
      </View>
    );
  }

  const resultado = proc.resultado;
  const efectivo = resultado.conteo_ajustado ?? resultado.conteo_ia;
  const nivel = resultado.nivel_confiabilidad;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero total */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>MELONES DETECTADOS</Text>
        <Text style={styles.heroTotal}>{efectivo.toLocaleString()}</Text>
        {resultado.conteo_ajustado != null && (
          <Text style={styles.heroIa}>
            IA original: {resultado.conteo_ia.toLocaleString()}
          </Text>
        )}
        {nivel && (
          <View style={[styles.badge, { backgroundColor: CONF_BG[nivel] }]}>
            <Text style={[styles.badgeText, { color: CONF_COLOR[nivel] }]}>
              {CONF_LABEL[nivel]}
            </Text>
          </View>
        )}
      </View>

      {/* Surcos */}
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Surcos</Text>
          <Text style={styles.infoValue}>
            {proc.surco_inicio}–{proc.surco_fin}
          </Text>
        </View>
        {resultado.promedio_confianza && (
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Confianza</Text>
            <Text style={styles.infoValue}>
              {(resultado.promedio_confianza * 100).toFixed(1)}%
            </Text>
          </View>
        )}
        {resultado.total_frames_procesados && (
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Frames</Text>
            <Text style={styles.infoValue}>
              {resultado.total_frames_procesados.toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      {/* Comparación con ciclo anterior */}
      {comparacion?.hay_historial && (
        <View style={styles.comparacionCard}>
          <Text style={styles.comparacionTitle}>Ciclo anterior</Text>
          <View style={styles.comparacionRow}>
            <Text style={styles.comparacionTotal}>
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
          {comparacion.conteo_anterior_fecha && (
            <Text style={styles.comparacionFecha}>
              {new Date(comparacion.conteo_anterior_fecha).toLocaleDateString(
                "es-GT",
                { day: "2-digit", month: "short", year: "numeric" },
              )}
            </Text>
          )}
        </View>
      )}

      {/* Ajuste de conteo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ajuste manual</Text>
        <Text style={styles.sectionSubtitle}>
          Si detectas oclusiones severas en el video, ajusta el conteo aquí.
        </Text>
        <View style={styles.ajusteRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={conteoAjustado}
            onChangeText={setConteoAjustado}
            keyboardType="number-pad"
            placeholder="Conteo final"
            placeholderTextColor="#a0b5a8"
          />
          <TouchableOpacity
            style={[styles.btnSmall, guardandoAjuste && styles.btnDisabled]}
            onPress={handleGuardarAjuste}
            disabled={guardandoAjuste}
          >
            {guardandoAjuste ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnSmallText}>Guardar</Text>
            )}
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.input, { minHeight: 60, marginTop: 8 }]}
          value={obsAjuste}
          onChangeText={setObsAjuste}
          placeholder="Observaciones (opcional)"
          placeholderTextColor="#a0b5a8"
          multiline
        />
      </View>

      {/* Muestreo por calibre */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Segmentación por calibre</Text>
        {muestreo && muestreo.clasificaciones.length > 0 ? (
          <>
            {muestreo.clasificaciones.map((c) => (
              <View key={c.calibre_id} style={styles.calibreRow}>
                <Text style={styles.calibreNombre}>{c.nombre_calibre}</Text>
                <Text style={styles.calibrePct}>
                  {c.porcentaje.toFixed(1)}%
                </Text>
                <Text style={styles.calibreTotal}>
                  {c.cantidad_extrapolada.toLocaleString()}
                </Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.btnOutline}
              onPress={() => {
                setShowMuestreo(true);
              }}
            >
              <Text style={styles.btnOutlineText}>Editar muestreo</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.btnOutline}
            onPress={() => setShowMuestreo(true)}
          >
            <Text style={styles.btnOutlineText}>
              + Ingresar muestreo de calibres
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Acciones */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Acciones</Text>
        <TouchableOpacity
          style={[styles.btnAction, descargando && styles.btnDisabled]}
          onPress={handleDescargarVideo}
          disabled={descargando}
        >
          {descargando ? (
            <ActivityIndicator size="small" color="#2d6a4f" />
          ) : null}
          <Text style={styles.btnActionText}>
            {descargando ? "Descargando..." : "🎬 Descargar video etiquetado"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnAction, generandoPdf && styles.btnDisabled]}
          onPress={handleGenerarPDF}
          disabled={generandoPdf}
        >
          {generandoPdf ? (
            <ActivityIndicator size="small" color="#2d6a4f" />
          ) : null}
          <Text style={styles.btnActionText}>
            {generandoPdf ? "Generando PDF..." : "📄 Exportar reporte PDF"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => {
            if (conteo) router.push(`/(app)/conteo/${conteo.id}`);
            else router.back();
          }}
        >
          <Text style={styles.btnSecondaryText}>Ver detalle del conteo</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de muestreo */}
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
            <TouchableOpacity onPress={() => setShowMuestreo(false)}>
              <Text style={styles.modalClose}>✕</Text>
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

          {/* Validación de suma */}
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
                <Text
                  style={{
                    color: ok ? "#065f46" : "#856404",
                    fontWeight: "700",
                  }}
                >
                  {suma} / {total} —{" "}
                  {ok
                    ? "✓ Completo"
                    : suma < total
                      ? `Faltan ${total - suma}`
                      : `Excede ${suma - total}`}
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
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 32,
  },
  loadingText: { color: "#5a7a6a", fontSize: 14 },
  procesandoTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1a2e25",
    textAlign: "center",
  },
  procesandoSub: {
    fontSize: 14,
    color: "#5a7a6a",
    textAlign: "center",
    lineHeight: 20,
  },
  procesandoHint: {
    fontSize: 12,
    color: "#8fa898",
    textAlign: "center",
    fontStyle: "italic",
  },
  hero: {
    backgroundColor: "#2d6a4f",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 1,
  },
  heroTotal: { fontSize: 56, fontWeight: "800", color: "#fff" },
  heroIa: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    marginTop: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
  infoRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 0,
  },
  infoItem: { flex: 1, alignItems: "center" },
  infoLabel: {
    fontSize: 11,
    color: "#8fa898",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1a2e25",
    marginTop: 2,
  },
  comparacionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#52b788",
  },
  comparacionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8fa898",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  comparacionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  comparacionTotal: { fontSize: 24, fontWeight: "800", color: "#1a2e25" },
  variacion: { fontSize: 16, fontWeight: "700" },
  comparacionFecha: { fontSize: 12, color: "#8fa898", marginTop: 2 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#3d5a4a",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionSubtitle: { fontSize: 12, color: "#8fa898", marginTop: -4 },
  label: { fontSize: 13, fontWeight: "600", color: "#3d5a4a" },
  input: {
    backgroundColor: "#f4f7f5",
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#1a2e25",
  },
  ajusteRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  btnSmall: {
    backgroundColor: "#2d6a4f",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  btnSmallText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  calibreRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
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
  btnOutline: {
    borderWidth: 1.5,
    borderColor: "#2d6a4f",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  btnOutlineText: { color: "#2d6a4f", fontWeight: "700", fontSize: 14 },
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
  btnSecondary: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    marginTop: 4,
  },
  btnSecondaryText: { color: "#5a7a6a", fontWeight: "600", fontSize: 14 },
  btnPrimary: {
    backgroundColor: "#2d6a4f",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    marginTop: 8,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  modal: { flex: 1, backgroundColor: "#fff" },
  modalContent: { padding: 24, gap: 12, paddingBottom: 48 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#1a2e25" },
  modalClose: { fontSize: 20, color: "#8fa898", padding: 4 },
  calibreInputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  calibreInputLabel: { fontSize: 15, fontWeight: "600", color: "#1a2e25" },
  sumaIndicador: {
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
});
