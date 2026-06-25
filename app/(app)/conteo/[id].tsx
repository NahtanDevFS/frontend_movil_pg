import { useEffect, useState, useCallback, useMemo } from "react";
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
  RefreshControl,
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
// A partir de cuántos videos la lista usa scroll interno (en vez de crecer)
const MAX_VIDEOS_SIN_SCROLL = 5;
// Altura máxima del contenedor scrollable de videos (4-5 filas visibles)
const MAX_VIDEOS_HEIGHT = 340;

// Lista de videos procesados. Si supera MAX_VIDEOS_SIN_SCROLL, se muestra dentro de un contenedor con scroll interno (mismo patrón que la grilla de surcos en nuevo conteo) para no alargar indefinidamente la pantalla.
function VideosLista({
  procs,
  onSelect,
}: {
  procs: ProcesamientoVideo[];
  onSelect: (id: number) => void;
}) {
  const filas = procs.map((p) => (
    <TouchableOpacity
      key={p.id}
      style={styles.procRow}
      onPress={() => onSelect(p.id)}
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
              { backgroundColor: CONF_BG[p.resultado.nivel_confiabilidad] },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: CONF_COLOR[p.resultado.nivel_confiabilidad] },
              ]}
            >
              IA:{" "}
              {p.resultado.nivel_confiabilidad.charAt(0).toUpperCase() +
                p.resultado.nivel_confiabilidad.slice(1)}
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color="#b7c9bf" />
      </View>
    </TouchableOpacity>
  ));

  if (procs.length > MAX_VIDEOS_SIN_SCROLL) {
    return (
      <ScrollView
        style={{ maxHeight: MAX_VIDEOS_HEIGHT }}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {filas}
      </ScrollView>
    );
  }
  return <>{filas}</>;
}

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
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [c, ps, cultivos] = await Promise.all([
        getConteo(conteoId),
        getProcesamientosPorConteo(conteoId),
        getCultivos(),
      ]);
      setConteo(c);
      setProcs(ps);
      setCultivo(cultivos.find((cu) => cu.id === c.campo_cultivo_id) ?? null);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cargar();
    setRefreshing(false);
  }, [cargar]);

  //logica de cobertura
  const surcosCubiertos = useMemo(() => {
    const setSurcos = new Set<number>();
    procs.forEach((p) => {
      // Solo sumamos los surcos de videos que terminaron con éxito
      if (p.resultado) {
        for (let i = p.surco_inicio; i <= p.surco_fin; i++) {
          setSurcos.add(i);
        }
      }
    });
    return setSurcos.size;
  }, [procs]);

  const coberturaCompleta = conteo
    ? surcosCubiertos >= conteo.total_surcos
    : false;

  const handleCompletar = () => {
    // Validar cobertura primero
    if (!coberturaCompleta) {
      Alert.alert(
        "Cobertura incompleta",
        `Aún faltan surcos por procesar. Se han cubierto ${surcosCubiertos} de ${conteo?.total_surcos} surcos requeridos para este cultivo.`,
      );
      return;
    }

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
      // Estilos compartidos por ambas tablas (inline porque el motor de
      // impresión no siempre respeta <style> en <head>)
      const thStyle =
        "padding:9px 8px;background:#2d6a4f;color:#fff;font-size:12px;font-weight:700;text-align:center;border:1px solid #2d6a4f";
      const tdStyle =
        "padding:8px;font-size:13px;text-align:center;border:1px solid #dde8e2;color:#1a2e25";
      const tdStrong =
        "padding:8px;font-size:13px;text-align:center;border:1px solid #dde8e2;color:#2d6a4f;font-weight:700";
      // Evita que una fila se parta entre dos páginas
      const trKeep = "page-break-inside:avoid";

      const videosHtml = procs
        .filter((p) => p.resultado)
        .map(
          (p, i) => `
        <tr style="${trKeep};background:${i % 2 === 0 ? "#ffffff" : "#f4f7f5"}">
          <td style="${tdStyle}">${p.surco_inicio}–${p.surco_fin}</td>
          <td style="${tdStyle}">${p.resultado!.conteo_ia.toLocaleString()}</td>
          <td style="${tdStyle}">${p.resultado!.conteo_ajustado?.toLocaleString() ?? "—"}</td>
          <td style="${tdStrong}">${(p.resultado!.conteo_ajustado ?? p.resultado!.conteo_ia).toLocaleString()}</td>
        </tr>`,
        )
        .join("");

      // Bloque de confianza (si hay datos)
      const nivel = conteo.nivel_confiabilidad;
      const confColor =
        nivel === "alto"
          ? "#065f46"
          : nivel === "moderado"
            ? "#856404"
            : "#991b1b";
      const confBg =
        nivel === "alto"
          ? "#d1fae5"
          : nivel === "moderado"
            ? "#fff3cd"
            : "#fee2e2";
      const nivelCap = nivel
        ? nivel.charAt(0).toUpperCase() + nivel.slice(1)
        : null;
      const confianzaHtml = nivel
        ? `
        <div style="page-break-inside:avoid;background:${confBg};border-radius:10px;padding:14px 16px;margin:20px 0">
          <p style="margin:0;font-weight:700;color:${confColor};font-size:14px">
            Nivel de confianza IA: ${nivelCap}
          </p>
          ${
            conteo.porcentaje_baja_confianza_sesion != null
              ? `<p style="margin:6px 0 0;font-size:12px;color:#5a7a6a">
                  ${Math.round((1 - conteo.porcentaje_baja_confianza_sesion) * 100)}% de detecciones con alta confianza,
                  ${Math.round(conteo.porcentaje_baja_confianza_sesion * 100)}% con baja confianza.
                </p>`
              : ""
          }
        </div>`
        : "";

      // Bloque de comparación con ciclo anterior (si hay historial)
      const comparacionHtml =
        comparacion?.hay_historial && comparacion.conteo_anterior_total != null
          ? `
        <div style="page-break-inside:avoid;background:#f4f7f5;border-radius:10px;padding:14px 16px;margin:20px 0">
          <p style="margin:0;font-size:11px;color:#5a7a6a;text-transform:uppercase;letter-spacing:1px">Comparación con ciclo anterior</p>
          <p style="margin:8px 0 0;font-size:14px;color:#1a2e25">
            Ciclo anterior: <b>${comparacion.conteo_anterior_total.toLocaleString()}</b> melones
          </p>
          ${
            comparacion.variacion_porcentual != null
              ? `<p style="margin:6px 0 0;font-size:14px;color:${comparacion.variacion_porcentual >= 0 ? "#065f46" : "#991b1b"}">
                  Variación: ${comparacion.variacion_porcentual >= 0 ? "+" : ""}${comparacion.variacion_porcentual.toFixed(1)}% respecto al ciclo actual
                </p>`
              : ""
          }
        </div>`
          : "";

      const calibresHtml = muestreo?.clasificaciones.length
        ? `
        <h3 style="color:#2d6a4f;margin-top:28px">Distribución por calibre</h3>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <thead style="display:table-header-group">
            <tr>
              <th style="${thStyle}">Calibre</th>
              <th style="${thStyle}">Porcentaje</th>
              <th style="${thStyle}">Melones estimados</th>
            </tr>
          </thead>
          <tbody>
            ${muestreo.clasificaciones
              .map(
                (c, i) => `
              <tr style="${trKeep};background:${i % 2 === 0 ? "#ffffff" : "#f4f7f5"}">
                <td style="${tdStyle}">${c.nombre_calibre}</td>
                <td style="${tdStyle}">${c.porcentaje.toFixed(1)}%</td>
                <td style="${tdStrong}">${c.cantidad_extrapolada.toLocaleString()}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>`
        : "";

      const html = `<html><head><meta name="viewport" content="width=device-width"></head>
      <body style="font-family:sans-serif;padding:32px;color:#1a2e25;max-width:600px;margin:0 auto">
        <div style="page-break-inside:avoid;background:#2d6a4f;padding:20px;border-radius:10px;color:#fff;margin-bottom:24px">
          <h1 style="margin:0">MelonCount</h1>
          <p style="margin:4px 0 0;opacity:0.7;font-size:12px">Sistema de Conteo Pre-cosecha · Amadeo Export S.A.</p>
        </div>
        <h2 style="color:#2d6a4f">Reporte de Conteo #${conteoId}</h2>
        <p style="color:#5a7a6a">${cultivo.nombre}${cultivo.municipio_nombre ? ' · <span style="text-transform:capitalize">' + cultivo.municipio_nombre + ", " + cultivo.departamento_nombre + "</span>" : ""}${cultivo.ubicacion ? " · " + cultivo.ubicacion : ""}</p>
        <div style="page-break-inside:avoid;background:#f4f7f5;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
          <p style="margin:0;font-size:11px;color:#5a7a6a;text-transform:uppercase;letter-spacing:1px">Total acumulado</p>
          <p style="margin:4px 0;font-size:56px;font-weight:800;color:#2d6a4f">${conteo.conteo_total_acumulado.toLocaleString()}</p>
          <p style="margin:0;color:#5a7a6a">melones</p>
        </div>
        ${confianzaHtml}
        ${comparacionHtml}
        <h3 style="color:#2d6a4f">Videos procesados</h3>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <thead style="display:table-header-group">
            <tr>
              <th style="${thStyle}">Surcos</th>
              <th style="${thStyle}">Conteo IA</th>
              <th style="${thStyle}">Ajustado</th>
              <th style="${thStyle}">Efectivo</th>
            </tr>
          </thead>
          <tbody>
            ${videosHtml}
          </tbody>
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
  const nivel = conteo.nivel_confiabilidad;

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
                Confianza IA: {nivel.charAt(0).toUpperCase() + nivel.slice(1)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Descripción del nivel de confianza (fila completa, legible) */}
      {nivel && (
        <View style={styles.confianzaCard}>
          <Text style={styles.confianzaTitulo}>
            Nivel de confianza:{" "}
            <Text style={{ color: CONF_COLOR[nivel] }}>
              {nivel.charAt(0).toUpperCase() + nivel.slice(1)}
            </Text>
          </Text>
          {conteo.porcentaje_baja_confianza_sesion != null && (
            <Text style={styles.confianzaDesc}>
              {Math.round((1 - conteo.porcentaje_baja_confianza_sesion) * 100)}%
              de detecciones con alta confianza,{" "}
              {Math.round(conteo.porcentaje_baja_confianza_sesion * 100)}% con
              baja confianza.
            </Text>
          )}
        </View>
      )}

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
                    campo_cultivo_id: conteo.campo_cultivo_id,
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
          <VideosLista
            procs={procs}
            onSelect={(pid) => router.push(`/(app)/procesamiento/${pid}`)}
          />
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

        {/* CONTENEDOR DE COBERTURA Y BOTÓN COMPLETAR */}
        {!completado && conteo.conteo_total_acumulado > 0 && (
          <View style={styles.coberturaWrapper}>
            <View style={styles.coberturaHeader}>
              <Text style={styles.coberturaLabel}>Cobertura de surcos</Text>
              <Text
                style={[
                  styles.coberturaVal,
                  { color: coberturaCompleta ? "#059669" : "#856404" },
                ]}
              >
                {surcosCubiertos} / {conteo.total_surcos}
              </Text>
            </View>

            {/* Barra de progreso */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      (surcosCubiertos / conteo.total_surcos) * 100,
                    )}%`,
                    backgroundColor: coberturaCompleta ? "#059669" : "#f59e0b",
                  },
                ]}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.btnCompletar,
                { marginTop: 16 }, // Espacio respecto a la barra de progreso
                (!coberturaCompleta || completando) && styles.btnDisabled,
              ]}
              // Mantenemos el botón presionable aunque falte cobertura,
              // para que la función handleCompletar pueda disparar la Alerta explicativa.
              disabled={completando}
              onPress={handleCompletar}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color="#fff"
              />
              <Text style={styles.btnCompletarText}>
                {completando ? "Completando..." : "Marcar como completado"}
              </Text>
            </TouchableOpacity>
          </View>
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
  confianzaCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3ece7",
    padding: 14,
    gap: 4,
  },
  confianzaTitulo: { fontSize: 14, fontWeight: "700", color: "#1a2e25" },
  confianzaDesc: { fontSize: 13, color: "#5a7a6a", lineHeight: 18 },
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

  coberturaWrapper: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#dde8e2",
  },
  coberturaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  coberturaLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5a7a6a",
    textTransform: "uppercase",
  },
  coberturaVal: {
    fontSize: 14,
    fontWeight: "800",
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#e8f5ee",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
});
