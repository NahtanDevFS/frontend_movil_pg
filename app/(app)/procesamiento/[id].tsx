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
  getProcesamientosPorConteo,
  ajustarConteo,
  editarSurcos,
  getConteo,
  getComparacionAnterior,
  getProgreso,
  cancelarProcesamiento,
  anularProcesamientoCompletado,
  hayVideoLocal,
  limpiarSubidaLocal,
  reanudarSubida,
  MENSAJE_SUBIDA_CANCELADA,
} from "../../../src/api/endpoints";
import { TOKEN_KEY } from "../../../src/api/client";
import SurcoGrid from "../../../src/components/SurcoGrid";
import {
  haySubidaActiva,
  ProgresoSubida,
  suscribirseASubidaActiva,
} from "../../../src/api/uploadRegistry";
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

const fmtTamano = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return mb < 1024 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`;
};

export default function ProcesamientoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const [progresoSubida, setProgresoSubida] = useState<ProgresoSubida | null>(
    null,
  );
  // false hasta saber si hay subida viva, pa no mostrar "interrumpida" por error al abrir la pantalla
  const [subidaVerificada, setSubidaVerificada] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [puedeReintentar, setPuedeReintentar] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const subidaRef = useRef<{
    cancelar: () => Promise<void>;
    desuscribir: () => void;
  } | null>(null);
  const cargadoRef = useRef(false);

  const [conteoAjustado, setConteoAjustado] = useState("");
  const [obsAjuste, setObsAjuste] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [guardandoAjuste, setGuardandoAjuste] = useState(false);
  const [editandoSurcos, setEditandoSurcos] = useState(false);
  const [surcoInicio, setSurcoInicio] = useState("");
  const [surcoFin, setSurcoFin] = useState("");
  // surcos de los demas videos, null mientras no se han podido cargar
  const [surcosOcupados, setSurcosOcupados] = useState<Set<number> | null>(
    null,
  );
  const [guardandoSurcos, setGuardandoSurcos] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [progresoDescarga, setProgresoDescarga] = useState(0);
  const [cancelando, setCancelando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const p = await getProcesamiento(procId);
      cargadoRef.current = true;
      setProc(p);
      // si la subida ya no aplica (cancelada desde la web, ya procesando), borramos lo que quedo en el telefono
      if (p.estado_nombre !== "pendiente" && !haySubidaActiva(procId)) {
        limpiarSubidaLocal(procId).catch(() => {});
      }
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
      // el poll corre cada 4s: solo avisamos si ni siquiera pudimos cargar la primera vez
      if (!cargadoRef.current) {
        Alert.alert("Error", "No se pudo cargar el resultado.");
      }
    } finally {
      setLoading(false);
    }
  }, [procId]);

  // se cuelga del progreso de la subida viva, devuelve false si no hay ninguna
  const conectarSubida = useCallback(() => {
    const suscripcion = suscribirseASubidaActiva(procId, setProgresoSubida);
    if (!suscripcion) return false;

    subidaRef.current = suscripcion;
    setErrorSubida(null);
    suscripcion.promise
      .then(async () => {
        // primero recargamos pa que la barra no se quite antes de ver el estado 'procesando'
        await cargar();
        setProgresoSubida(null);
      })
      .catch(async (err: any) => {
        setProgresoSubida(null);
        const msg: string = err?.message ?? "No se pudo subir el video.";
        if (msg !== MENSAJE_SUBIDA_CANCELADA) setErrorSubida(msg);
        setPuedeReintentar(await hayVideoLocal(procId).catch(() => false));
      })
      .finally(() => {
        suscripcion.desuscribir();
        subidaRef.current = null;
      });
    return true;
  }, [procId, cargar]);

  // muestra y/o retoma la subida del video sin importar como llegamos a esta pantalla
  useEffect(() => {
    (async () => {
      try {
        // si la app se cerro a medias quedo anotada en AsyncStorage y aca se retoma
        await reanudarSubida(procId);
        if (!conectarSubida()) {
          setPuedeReintentar(await hayVideoLocal(procId));
        }
      } catch (err: any) {
        setErrorSubida(err?.message ?? "No se pudo retomar la subida.");
      } finally {
        setSubidaVerificada(true);
      }
    })();

    return () => {
      subidaRef.current?.desuscribir();
    };
  }, [procId, conectarSubida]);

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
    if (proc.conteo_estado_nombre === "completado") return;
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

  const abrirEditorSurcos = async () => {
    if (!proc) return;
    setSurcoInicio(String(proc.surco_inicio));
    setSurcoFin(String(proc.surco_fin));
    setSurcosOcupados(null);
    setEditandoSurcos(true);
    try {
      const procs = await getProcesamientosPorConteo(proc.conteo_id);
      const ocupados = new Set<number>();
      procs
        .filter((p) => p.id !== proc.id)
        .forEach((p) => {
          for (let s = p.surco_inicio; s <= p.surco_fin; s++) ocupados.add(s);
        });
      setSurcosOcupados(ocupados);
    } catch {
      // sin la grilla se puede editar igual, el backend valida los solapes
    }
  };

  const handleGuardarSurcos = async () => {
    const inicio = parseInt(surcoInicio);
    const fin = parseInt(surcoFin);
    if (isNaN(inicio) || isNaN(fin) || inicio < 1 || fin < inicio)
      return Alert.alert(
        "Rango inválido",
        "El surco final debe ser mayor o igual al inicial.",
      );
    setGuardandoSurcos(true);
    try {
      await editarSurcos(procId, { surco_inicio: inicio, surco_fin: fin });
      await cargar();
      setEditandoSurcos(false);
      Alert.alert("Surcos actualizados");
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.response?.data?.detail ?? "No se pudieron actualizar los surcos.",
      );
    } finally {
      setGuardandoSurcos(false);
    }
  };

  // cancela en el server y libera el rango de surcos
  const ejecutarCancelacion = async () => {
    setCancelando(true);
    try {
      await cancelarProcesamiento(procId);
      await limpiarSubidaLocal(procId);
      // actualizamos el estado local directo (sin recargar) pa que se vea cancelado al toque
      setProc((prev) =>
        prev ? { ...prev, estado_nombre: "cancelado" } : prev,
      );
      setProcesando(true); // fuerza la rama de estado terminal
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.response?.data?.detail ??
          "No se pudo cancelar. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setCancelando(false);
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
          onPress: ejecutarCancelacion,
        },
      ],
    );
  };

  const handleCancelarSubida = () => {
    Alert.alert(
      "Cancelar subida",
      "¿Seguro que deseas cancelar la subida? Lo que ya se subió se descartará y su rango de surcos quedará libre.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: async () => {
            await subidaRef.current?.cancelar();
            // sin conexion igual queda detenida; se descarta el video pa que no se retome sola
            await limpiarSubidaLocal(procId);
            setPuedeReintentar(false);
            setProgresoSubida(null);
            await ejecutarCancelacion();
          },
        },
      ],
    );
  };

  const handleLiberarSurcos = () => {
    Alert.alert(
      "Liberar surcos",
      "Se descartará este video y su rango de surcos quedará libre para volver a subirlo. ¿Continuar?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, liberar",
          style: "destructive",
          onPress: ejecutarCancelacion,
        },
      ],
    );
  };

  const handleReintentarSubida = async () => {
    setReintentando(true);
    setErrorSubida(null);
    try {
      await reanudarSubida(procId);
      conectarSubida();
    } catch (err: any) {
      setErrorSubida(err?.message ?? "No se pudo retomar la subida.");
    } finally {
      setReintentando(false);
    }
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
              : "Ocurrió un error al procesar el video. Libera sus surcos para poder subirlo de nuevo."}
          </Text>
          {estado === "error" && (
            <TouchableOpacity
              style={styles.btnCancelarProc}
              onPress={handleLiberarSurcos}
              disabled={cancelando}
              activeOpacity={0.85}
            >
              {cancelando ? (
                <ActivityIndicator size="small" color="#991b1b" />
              ) : (
                <Text style={styles.btnCancelarProcText}>Liberar surcos</Text>
              )}
            </TouchableOpacity>
          )}
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
    // en 0 todavia no se confirma el primer bloque
    const conectando = subiendo && progresoSubida.bytesSubidos === 0;

    // pendiente sin subida viva: todavia lo estamos comprobando o la subida se quedo a medias
    if (estado === "pendiente" && !subiendo) {
      if (!subidaVerificada)
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2d6a4f" />
          </View>
        );

      return (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={56} color="#991b1b" />
          <Text style={styles.procesandoTitle}>
            La subida no se completó
          </Text>
          <Text style={styles.procesandoSub}>
            {errorSubida ?? "No hay una subida activa en este teléfono."}
          </Text>
          <Text style={styles.procesandoHint}>
            {puedeReintentar
              ? "Puedes continuar desde donde se quedó o liberar sus surcos."
              : "El video ya no está disponible aquí. Libera sus surcos para subirlo de nuevo."}
          </Text>
          {puedeReintentar && (
            <TouchableOpacity
              style={styles.btnVolver}
              onPress={handleReintentarSubida}
              disabled={reintentando}
              activeOpacity={0.85}
            >
              {reintentando ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnVolverText}>Reintentar subida</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.btnCancelarProc}
            onPress={handleLiberarSurcos}
            disabled={cancelando}
            activeOpacity={0.85}
          >
            {cancelando ? (
              <ActivityIndicator size="small" color="#991b1b" />
            ) : (
              <Text style={styles.btnCancelarProcText}>Liberar surcos</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />

        {/* Fase 1: subida del video */}
        {subiendo ? (
          <>
            <Text style={styles.procesandoTitle}>
              {conectando ? "Conectando..." : "Subiendo video..."}
            </Text>
            <View style={styles.barraWrap}>
              <View style={styles.barraTrack}>
                <View
                  style={[
                    styles.barraFill,
                    { width: `${progresoSubida.pct}%` },
                  ]}
                />
              </View>
              <Text style={styles.barraPct}>{progresoSubida.pct}%</Text>
            </View>
            {!conectando && (
              <Text style={styles.subidaBytes}>
                {fmtTamano(progresoSubida.bytesSubidos)} de{" "}
                {fmtTamano(progresoSubida.bytesTotales)}
              </Text>
            )}
            <Text style={styles.procesandoSub}>
              Mantén la app abierta hasta que termine. Si se interrumpe, podrás
              continuar desde donde se quedó.
            </Text>
            <TouchableOpacity
              style={styles.btnCancelarProc}
              onPress={handleCancelarSubida}
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
                    Cancelar subida
                  </Text>
                </>
              )}
            </TouchableOpacity>
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
  const sinDetecciones =
    resultado.conteo_ia === 0 && resultado.conteo_ajustado == null;
  const ocultarMetricasIa = resultado.conteo_ia === 0;

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
      {sinDetecciones ? (
        <View style={styles.heroVacio}>
          <Ionicons name="search-outline" size={44} color="#8fa898" />
          <Text style={styles.heroVacioTitle}>No se detectaron melones</Text>
          <Text style={styles.heroVacioSub}>
            La IA no encontró melones en este video. Si observaste melones en el
            campo, puedes registrar el conteo manualmente más abajo.
          </Text>
        </View>
      ) : (
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>MELONES DETECTADOS</Text>
          <Text style={styles.heroTotal}>{efectivo.toLocaleString()}</Text>
          {resultado.conteo_ajustado != null && (
            <Text style={styles.heroIa}>
              Conteo IA original: {resultado.conteo_ia.toLocaleString()}
            </Text>
          )}
          {nivel && !ocultarMetricasIa && (
            <View style={[styles.badge, { backgroundColor: CONF_BG[nivel] }]}>
              <Text style={[styles.badgeText, { color: CONF_COLOR[nivel] }]}>
                {CONF_LABEL[nivel]}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Métricas */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Surcos</Text>
          <Text style={styles.metricValue}>
            {proc.surco_inicio}–{proc.surco_fin}
          </Text>
          {proc.conteo_estado_nombre !== "completado" && !editandoSurcos && (
            <TouchableOpacity onPress={abrirEditorSurcos}>
              <Text style={styles.linkEditar}>Editar</Text>
            </TouchableOpacity>
          )}
        </View>
        {!ocultarMetricasIa && resultado.promedio_confianza && (
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Confianza</Text>
            <Text style={styles.metricValue}>
              {(resultado.promedio_confianza * 100).toFixed(1)}%
            </Text>
          </View>
        )}
        {!ocultarMetricasIa && resultado.total_frames_procesados && (
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Frames</Text>
            <Text style={styles.metricValue}>
              {resultado.total_frames_procesados.toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      {/* Editar surcos */}
      {editandoSurcos && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Editar surcos</Text>
          <Text style={styles.sectionSub}>
            Corrige los surcos que cubre este video. El conteo no cambia.
          </Text>
          {conteo && surcosOcupados && (
            <SurcoGrid
              totalSurcos={conteo.total_surcos}
              bloqueados={surcosOcupados}
              surcoInicio={surcoInicio}
              surcoFin={surcoFin}
              margenLateral={32}
            />
          )}
          <View style={styles.ajusteRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={surcoInicio}
              onChangeText={setSurcoInicio}
              keyboardType="number-pad"
              placeholder="Desde"
              placeholderTextColor="#a0b5a8"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={surcoFin}
              onChangeText={setSurcoFin}
              keyboardType="number-pad"
              placeholder="Hasta"
              placeholderTextColor="#a0b5a8"
            />
          </View>
          <View style={styles.ajusteRow}>
            <TouchableOpacity
              onPress={() => setEditandoSurcos(false)}
              disabled={guardandoSurcos}
              style={styles.btnCancelarSurcos}
            >
              <Text style={styles.btnCancelarSurcosText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btnSmall,
                { flex: 1, alignItems: "center" },
                guardandoSurcos && styles.btnDisabled,
              ]}
              onPress={handleGuardarSurcos}
              disabled={guardandoSurcos}
            >
              {guardandoSurcos ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnSmallText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

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
        {proc.conteo_estado_nombre === "completado" ? (
          <View style={styles.avisoConteoCompletado}>
            <Ionicons name="lock-closed-outline" size={16} color="#8fa898" />
            <Text style={styles.avisoConteoCompletadoText}>
              Este conteo está completado. Para realizar ajustes manuales, un
              administrador debe reabrirlo primero.
            </Text>
          </View>
        ) : (
          <>
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
          </>
        )}
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
  heroVacio: {
    backgroundColor: "#eef3ef",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  heroVacioTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a2e25",
    textAlign: "center",
  },
  heroVacioSub: {
    fontSize: 13,
    lineHeight: 19,
    color: "#4a5f52",
    textAlign: "center",
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
  linkEditar: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2d6a4f",
    marginTop: 4,
  },
  btnCancelarSurcos: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    borderRadius: 10,
    paddingVertical: 12,
  },
  btnCancelarSurcosText: { color: "#5a7a6a", fontWeight: "700", fontSize: 14 },
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
  subidaBytes: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2d6a4f",
    marginTop: 8,
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
