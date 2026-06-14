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
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import {
  getProcesamiento,
  ajustarConteo,
  getConteo,
  getComparacionAnterior,
} from "../../../src/api/endpoints";
import { TOKEN_KEY } from "../../../src/api/client";
import {
  ProcesamientoVideo,
  Conteo,
  ComparacionAnterior,
} from "../../../src/types";
import Constants from "expo-constants";

const API_URL = Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:8000";
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
const CONF_LABEL: Record<string, string> = {
  alto: "Alta confiabilidad",
  moderado: "Confiabilidad moderada",
  bajo: "Baja confiabilidad",
};

export default function ProcesamientoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const procId = Number(id);

  const [proc, setProc] = useState<ProcesamientoVideo | null>(null);
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [comparacion, setComparacion] = useState<ComparacionAnterior | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [conteoAjustado, setConteoAjustado] = useState("");
  const [obsAjuste, setObsAjuste] = useState("");
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const p = await getProcesamiento(procId);
      setProc(p);
      if (p.resultado) {
        setProcesando(false);
        if (pollRef.current) clearInterval(pollRef.current);
        const c = await getConteo(p.conteo_id);
        setConteo(c);
        setConteoAjustado(
          String(p.resultado.conteo_ajustado ?? p.resultado.conteo_ia),
        );
        const comp = await getComparacionAnterior(c.id).catch(() => null);
        if (comp) setComparacion(comp);
      } else {
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
      Alert.alert("Ajuste guardado");
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.detail ?? "No se pudo guardar.");
    } finally {
      setGuardandoAjuste(false);
    }
  };

  const handleDescargarVideo = async () => {
    if (!proc?.video_anotado_url)
      return Alert.alert("Sin video", "El video anotado no está disponible.");
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

  if (loading)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );

  if (procesando || !proc?.resultado) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
        <Text style={styles.procesandoTitle}>Procesando video con IA</Text>
        <Text style={styles.procesandoSub}>
          El modelo está analizando los frames. Esto puede tomar varios minutos.
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
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>MELONES DETECTADOS</Text>
        <Text style={styles.heroTotal}>{efectivo.toLocaleString()}</Text>
        {resultado.conteo_ajustado != null && (
          <Text style={styles.heroIa}>
            Conteo IA original: {resultado.conteo_ia.toLocaleString()}
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

      {/* Métricas */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Surcos</Text>
          <Text style={styles.metricValue}>
            {proc.surco_inicio}–{proc.surco_fin}
          </Text>
        </View>
        {resultado.promedio_confianza && (
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Confianza</Text>
            <Text style={styles.metricValue}>
              {(resultado.promedio_confianza * 100).toFixed(1)}%
            </Text>
          </View>
        )}
        {resultado.total_frames_procesados && (
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Frames</Text>
            <Text style={styles.metricValue}>
              {resultado.total_frames_procesados.toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      {/* Comparación */}
      {comparacion?.hay_historial && (
        <View style={styles.comparCard}>
          <Text style={styles.sectionLabel}>Ciclo anterior</Text>
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

      {/* Ajuste manual */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Ajuste manual</Text>
        <Text style={styles.sectionSub}>
          Corrige el conteo si detectas oclusiones severas en el video.
        </Text>
        <View style={styles.ajusteRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={conteoAjustado}
            onChangeText={setConteoAjustado}
            keyboardType="number-pad"
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
          style={[styles.input, { minHeight: 56, marginTop: 8 }]}
          value={obsAjuste}
          onChangeText={setObsAjuste}
          placeholder="Observaciones (opcional)"
          placeholderTextColor="#a0b5a8"
          multiline
        />
      </View>

      {/* Acciones */}
      {/* Acciones */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Acciones</Text>
        <TouchableOpacity
          style={[styles.btnAction, descargando && styles.btnDisabled]}
          onPress={handleDescargarVideo}
          disabled={descargando}
        >
          <Ionicons name="videocam-outline" size={18} color="#1a2e25" />
          <Text style={styles.btnActionText}>
            {descargando ? "Descargando..." : "Descargar video etiquetado"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f5" },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    padding: 32,
  },
  procesandoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a2e25",
    textAlign: "center",
  },
  procesandoSub: {
    fontSize: 13,
    color: "#5a7a6a",
    textAlign: "center",
    lineHeight: 20,
  },
  procesandoHint: {
    fontSize: 12,
    color: "#8fa898",
    fontStyle: "italic",
    textAlign: "center",
  },
  hero: {
    backgroundColor: "#2d6a4f",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTotal: { fontSize: 56, fontWeight: "800", color: "#fff" },
  heroIa: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 2,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
  metricsRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  metricItem: { flex: 1, alignItems: "center", padding: 14 },
  metricLabel: {
    fontSize: 10,
    color: "#8fa898",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1a2e25",
    marginTop: 3,
  },
  comparCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#52b788",
    borderWidth: 1,
    borderColor: "#dde8e2",
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5a7a6a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionSub: { fontSize: 12, color: "#8fa898", marginTop: -4 },
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
  btnAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f4f7f5",
    borderRadius: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  btnActionText: { fontSize: 14, fontWeight: "600", color: "#1a2e25" },
  btnSecondary: {
    borderRadius: 10,
    padding: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  btnSecondaryText: { color: "#5a7a6a", fontWeight: "600", fontSize: 14 },
});
