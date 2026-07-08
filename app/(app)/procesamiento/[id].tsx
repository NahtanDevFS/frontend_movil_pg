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
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import {
  getProcesamiento,
  ajustarConteo,
  getConteo,
  getComparacionAnterior,
  getProgreso,
  cancelarProcesamiento,
  anularProcesamientoCompletado,
} from "../../../src/api/endpoints";
import { TOKEN_KEY } from "../../../src/api/client";
import { suscribirseASubidaActiva } from "../../../src/api/uploadRegistry";
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
  // el param subidaEnCurso ya no manda, la barra se detecta sola por el registro en memoria o AsyncStorage; lo dejamos por compatibilidad
  const { id } = useLocalSearchParams<{
    id: string;
    subidaEnCurso?: string;
  }>();
  const procId = Number(id);
  const router = useRouter();

  const [proc, setProc] = useState<ProcesamientoVideo | null>(null);
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [comparacion, setComparacion] = useState<ComparacionAnterior | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState<{
    progreso_pct: number;
    conteo_parcial: number;
    disponible: boolean;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // progreso de la subida (null = no hay subida), se resuelve al montar mirando el registro en memoria o AsyncStorage
  const [progresoSubida, setProgresoSubida] = useState<number | null>(null);
  const subidaResueltaRef = useRef(false);

  const [conteoAjustado, setConteoAjustado] = useState("");
  const [obsAjuste, setObsAjuste] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [guardandoAjuste, setGuardandoAjuste] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [progresoDescarga, setProgresoDescarga] = useState(0);
  const [cancelando, setCancelando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const p = await getProcesamiento(procId);
      setProc(p);
      if (p.resultado) {
        setProcesando(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        const c = await getConteo(p.conteo_id);
        setConteo(c);
        setConteoAjustado(
          String(p.resultado.conteo_ajustado ?? p.resultado.conteo_ia),
        );
        setObsAjuste(p.resultado.observaciones_ajuste ?? "");
        const comp = await getComparacionAnterior(c.id).catch(() => null);
        if (comp) setComparacion(comp);
      } else if (
        p.estado_nombre === "cancelado" ||
        p.estado_nombre === "error"
      ) {
        setProcesando(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else {
        setProcesando(true);
        try {
          const pr = await getProgreso(procId);
          setProgreso(pr);
        } catch {
          // todavia no hay progreso
        }
      }
    } catch {
      Alert.alert("Error", "No se pudo cargar el resultado.");
    } finally {
      setLoading(false);
    }
  }, [procId]);

  // muestra y/o retoma la subida del video sin importar como llegamos a esta pantalla
  useEffect(() => {
    if (subidaResueltaRef.current) return;

    // 1. si ya hay una subida corriendo en memoria, solo nos colgamos de su progreso, no lanzamos otra
    const suscripcion = suscribirseASubidaActiva(procId, (pct) => {
      setProgresoSubida(pct);
    });

    if (suscripcion) {
      subidaResueltaRef.current = true;
      setProgresoSubida(0); // valor inicial mientras llega la primera actualización

      const AsyncStoragePromise =
        import("@react-native-async-storage/async-storage");

      suscripcion.promise
        .then(async () => {
          setProgresoSubida(null);
          const AsyncStorage = (await AsyncStoragePromise).default;
          await AsyncStorage.removeItem(`subida:${procId}`).catch(() => {});
        })
        .catch(async () => {
          setProgresoSubida(null);
          const AsyncStorage = (await AsyncStoragePromise).default;
          await AsyncStorage.removeItem(`subida:${procId}`).catch(() => {});
          // el error ya lo alerta quien arranco la subida, aca solo limpiamos lo visual pa no duplicar el aviso
        })
        .finally(() => {
          suscripcion.desuscribir();
        });

      return () => {
        suscripcion.desuscribir();
      };
    }

    // 2. si no hay en memoria pero quedo una pendiente en AsyncStorage (app cerrada y reabierta), la retomamos
    (async () => {
      try {
        const AsyncStorage = (
          await import("@react-native-async-storage/async-storage")
        ).default;
        const raw = await AsyncStorage.getItem(`subida:${procId}`);
        if (!raw) return; // no hay nada pendiente, no mostramos barra

        let videoUri: string;
        let mimeType: string | undefined;
        try {
          const parsed = JSON.parse(raw);
          videoUri = parsed.uri;
          mimeType = parsed.mimeType ?? undefined;
        } catch {
          // por compatibilidad con el formato viejo (antes era solo un string)
          videoUri = raw;
          mimeType = undefined;
        }

        const SecureStore = await import("expo-secure-store");
        const { TOKEN_KEY } = await import("../../../src/api/client");
        const { subirVideoBackground, cancelarProcesamiento } =
          await import("../../../src/api/endpoints");
        const token = (await SecureStore.getItemAsync(TOKEN_KEY)) ?? "";

        subidaResueltaRef.current = true;
        setProgresoSubida(0);

        const subida = subirVideoBackground(
          procId,
          videoUri,
          token,
          (pct) => setProgresoSubida(pct),
          mimeType,
        );

        try {
          await subida.promise;
          // subida ok: borramos el uri guardado y quitamos la barra
          await AsyncStorage.removeItem(`subida:${procId}`);
          setProgresoSubida(null);
          // el estado va a pasar a 'procesando' y el poll lo va a agarrar
        } catch (err: any) {
          await AsyncStorage.removeItem(`subida:${procId}`);
          setProgresoSubida(null);
          const msg: string = err?.message ?? "No se pudo subir el video.";
          if (msg !== "Subida cancelada.") {
            try {
              await cancelarProcesamiento(procId);
            } catch {
              /* ignorar */
            }
            Alert.alert(
              "Error al subir el video",
              msg +
                "\n\nEl procesamiento fue cancelado. Puedes intentarlo de nuevo.",
            );
          }
        }
      } catch {
        // si algo falla leyendo AsyncStorage, ni modo, no mostramos barra
      }
    })();
  }, [procId]);

  useEffect(() => {
    cargar();
    pollRef.current = setInterval(() => {
      cargar();
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [cargar]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cargar();
    setRefreshing(false);
  }, [cargar]);

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

  const handleCancelarProcesamiento = () => {
    Alert.alert(
      "Cancelar procesamiento",
      "¿Seguro que deseas cancelar este procesamiento? Su rango de surcos quedará libre.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: async () => {
            setCancelando(true);
            // paramos el polling antes de cancelar, pa que ningun tick en vuelo dispare una alerta de error
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            try {
              await cancelarProcesamiento(procId);
              // actualizamos el estado local directo (sin recargar) pa que se vea cancelado al toque
              setProc((prev) =>
                prev ? { ...prev, estado_nombre: "cancelado" } : prev,
              );
              setProcesando(true); // fuerza la rama de estado terminal
            } catch (err: any) {
              Alert.alert(
                "Error",
                err.response?.data?.detail ?? "No se pudo cancelar.",
              );
            } finally {
              setCancelando(false);
            }
          },
        },
      ],
    );
  };

  const handleDescargarVideo = async () => {
    if (!proc?.video_anotado_url)
      return Alert.alert("Sin video", "El video anotado no está disponible.");
    setDescargando(true);
    setProgresoDescarga(0);
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const destino =
        FileSystem.documentDirectory + `conteo_video_${procId}.mp4`;

      const downloadResumable = FileSystem.createDownloadResumable(
        `${API_URL}/procesamientos/${procId}/video-anotado`,
        destino,
        { headers: { Authorization: `Bearer ${token}` } },
        (downloadProgress) => {
          const { totalBytesWritten, totalBytesExpectedToWrite } =
            downloadProgress;
          if (totalBytesExpectedToWrite > 0) {
            const porcentaje = Math.round(
              (totalBytesWritten / totalBytesExpectedToWrite) * 100,
            );
            setProgresoDescarga(porcentaje);
          }
        },
      );

      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) throw new Error("No se pudo descargar el video.");
      await Sharing.shareAsync(result.uri);
    } catch {
      Alert.alert("Error", "No se pudo descargar el video.");
    } finally {
      setDescargando(false);
      setProgresoDescarga(0);
    }
  };

  const handleAnularProcesamiento = () => {
    Alert.alert(
      "Anular procesamiento",
      "¿Seguro que deseas anular este procesamiento? Su conteo quedará excluido del total acumulado y el rango de surcos quedará libre.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, anular",
          style: "destructive",
          onPress: async () => {
            setAnulando(true);
            try {
              await anularProcesamientoCompletado(procId);
              setProc((prev) =>
                prev ? { ...prev, estado_nombre: "cancelado" } : prev,
              );
              // nos vamos pa atras pa que se refresque la lista del conteo
              router.back();
            } catch (err: any) {
              Alert.alert(
                "Error",
                err.response?.data?.detail ??
                  "No se pudo anular el procesamiento.",
              );
            } finally {
              setAnulando(false);
            }
          },
        },
      ],
    );
  };

  if (loading)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );

  if (procesando || !proc?.resultado) {
    const estado = proc?.estado_nombre;

    // estado terminal sin resultado (cancelado o error): ya no seguimos mostrando "procesando"
    if (estado === "cancelado" || estado === "error") {
      return (
        <View style={styles.centered}>
          <Ionicons
            name={estado === "cancelado" ? "close-circle" : "alert-circle"}
            size={56}
            color={estado === "cancelado" ? "#8fa898" : "#991b1b"}
          />
          <Text style={styles.procesandoTitle}>
            {estado === "cancelado"
              ? "Procesamiento cancelado"
              : "El procesamiento falló"}
          </Text>
          <Text style={styles.procesandoSub}>
            {estado === "cancelado"
              ? "Este video fue cancelado. Su rango de surcos quedó libre para volver a intentarlo."
              : "Ocurrió un error al procesar el video. Puedes registrar el video nuevamente."}
          </Text>
          <TouchableOpacity
            style={styles.btnVolver}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.btnVolverText}>Volver</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const hayBarra = progreso?.disponible && progreso.progreso_pct > 0;
    const hayParcial = progreso?.disponible;
    // se puede cancelar mientras esta pendiente o procesando
    const puedeCancelar = estado === "pendiente" || estado === "procesando";
    // si hay progresoSubida es que la subida sigue en curso
    const subiendo = progresoSubida !== null;

    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />

        {/* Fase 1: subida del video */}
        {subiendo ? (
          <>
            <Text style={styles.procesandoTitle}>Subiendo video...</Text>
            <View style={styles.barraWrap}>
              <View style={styles.barraTrack}>
                <View
                  style={[styles.barraFill, { width: `${progresoSubida}%` }]}
                />
              </View>
              <Text style={styles.barraPct}>{progresoSubida}%</Text>
            </View>
            <Text style={styles.procesandoSub}>
              Puedes navegar libremente. La subida continúa en segundo plano.
            </Text>
          </>
        ) : (
          <>
            {/* Fase 2: procesamiento GPU */}
            <Text style={styles.procesandoTitle}>Procesando video con IA</Text>

            {hayParcial && (
              <View style={styles.parcialBox}>
                <Text style={styles.parcialNum}>
                  {progreso!.conteo_parcial.toLocaleString()}
                </Text>
                <Text style={styles.parcialLabel}>
                  melones detectados hasta ahora
                </Text>
              </View>
            )}

            {hayBarra && (
              <View style={styles.barraWrap}>
                <View style={styles.barraTrack}>
                  <View
                    style={[
                      styles.barraFill,
                      { width: `${progreso!.progreso_pct}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barraPct}>{progreso!.progreso_pct}%</Text>
              </View>
            )}

            <Text style={styles.procesandoSub}>
              El modelo está analizando los frames. Esto puede tomar varios
              minutos.
            </Text>
            <Text style={styles.procesandoHint}>
              Esta pantalla se actualiza automáticamente.
            </Text>

            {puedeCancelar && (
              <TouchableOpacity
                style={styles.btnCancelarProc}
                onPress={handleCancelarProcesamiento}
                disabled={cancelando}
                activeOpacity={0.85}
              >
                {cancelando ? (
                  <ActivityIndicator size="small" color="#991b1b" />
                ) : (
                  <>
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color="#991b1b"
                    />
                    <Text style={styles.btnCancelarProcText}>
                      Cancelar procesamiento
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  }

  const resultado = proc.resultado;
  const efectivo = resultado.conteo_ajustado ?? resultado.conteo_ia;
  const nivel = resultado.nivel_confiabilidad;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#2d6a4f"]}
          tintColor="#2d6a4f"
        />
      }
    >
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
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Acciones</Text>
        <TouchableOpacity
          style={[styles.btnAction, descargando && styles.btnDisabled]}
          onPress={handleDescargarVideo}
          disabled={descargando}
        >
          <Ionicons name="videocam-outline" size={18} color="#1a2e25" />
          <Text style={styles.btnActionText}>
            {descargando
              ? `Descargando... ${progresoDescarga}%`
              : "Descargar video etiquetado"}
          </Text>
        </TouchableOpacity>
        {proc.conteo_estado_nombre === "completado" ? (
          <View style={styles.avisoConteoCompletado}>
            <Ionicons name="lock-closed-outline" size={16} color="#8fa898" />
            <Text style={styles.avisoConteoCompletadoText}>
              Este conteo está completado. Para modificar o anular
              procesamientos, un administrador debe reabrirlo primero.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.btnAnular, anulando && styles.btnDisabled]}
            onPress={handleAnularProcesamiento}
            disabled={anulando}
          >
            {anulando ? (
              <ActivityIndicator size="small" color="#991b1b" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#991b1b" />
                <Text style={styles.btnAnularText}>Anular procesamiento</Text>
              </>
            )}
          </TouchableOpacity>
        )}
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
  btnAnular: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  btnAnularText: { fontSize: 14, fontWeight: "600", color: "#991b1b" },
  btnSecondary: {
    borderRadius: 10,
    padding: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  avisoConteoCompletado: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#eef3ef",
    borderRadius: 10,
    padding: 12,
  },
  avisoConteoCompletadoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#4a5f52",
  },
  btnSecondaryText: { color: "#5a7a6a", fontWeight: "600", fontSize: 14 },
  parcialBox: {
    alignItems: "center",
    gap: 2,
    marginVertical: 4,
  },
  parcialNum: {
    fontSize: 44,
    fontWeight: "800",
    color: "#2d6a4f",
  },
  parcialLabel: {
    fontSize: 13,
    color: "#5a7a6a",
    textAlign: "center",
  },
  barraWrap: {
    width: "100%",
    maxWidth: 280,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  barraTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#dde8e2",
    overflow: "hidden",
  },
  barraFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#2d6a4f",
  },
  barraPct: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2d6a4f",
    minWidth: 36,
    textAlign: "right",
  },
  btnCancelarProc: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#fca5a5",
    backgroundColor: "#fee2e2",
    minWidth: 200,
  },
  btnCancelarProcText: { fontSize: 14, fontWeight: "700", color: "#991b1b" },
  btnVolver: {
    marginTop: 20,
    paddingVertical: 11,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: "#2d6a4f",
  },
  btnVolverText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
