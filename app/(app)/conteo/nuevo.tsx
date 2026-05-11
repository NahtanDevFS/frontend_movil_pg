import { useEffect, useState } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import {
  getVariedades,
  getConteosPorCultivo,
  crearConteo,
  getProcesamientosPorConteo,
  subirVideo,
} from "../../../src/api/endpoints";
import { Variedad, Conteo } from "../../../src/types";

export default function NuevoConteoScreen() {
  const router = useRouter();
  const { cultivo_id, conteo_id } = useLocalSearchParams<{
    cultivo_id: string;
    conteo_id?: string;
  }>();
  const cultivoId = Number(cultivo_id);

  const [paso, setPaso] = useState<"configurar" | "subir" | "subiendo">(
    "configurar",
  );
  const [variedades, setVariedades] = useState<Variedad[]>([]);
  const [variedadId, setVariedadId] = useState<number | null>(null);
  const [conteosAbiertos, setConteosAbiertos] = useState<Conteo[]>([]);
  const [conteoSeleccionado, setConteoSeleccionado] = useState<Conteo | null>(
    null,
  );
  const [modoConteo, setModoConteo] = useState<"nuevo" | "existente">("nuevo");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [surcoInicio, setSurcoInicio] = useState("");
  const [surcoFin, setSurcoFin] = useState("");
  const [videoFile, setVideoFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [surcosBloqueados, setSurcosBloqueados] = useState<Set<number>>(
    new Set(),
  );
  const [totalSurcos, setTotalSurcos] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const [vars, conteos] = await Promise.all([
          getVariedades(),
          getConteosPorCultivo(cultivoId),
        ]);
        setVariedades(vars);
        if (vars.length > 0) setVariedadId(vars[0].id);
        const abiertos = conteos.filter((c) => c.estado_id !== 2);
        setConteosAbiertos(abiertos);
        if (conteo_id) {
          const existente = conteos.find((c) => c.id === Number(conteo_id));
          if (existente) {
            setModoConteo("existente");
            setConteoSeleccionado(existente);
            setTotalSurcos(existente.total_surcos);
          }
        } else if (abiertos.length > 0) {
          setModoConteo("existente");
          setConteoSeleccionado(abiertos[0]);
          setTotalSurcos(abiertos[0].total_surcos);
        }
      } finally {
        setLoadingConfig(false);
      }
    };
    init();
  }, [cultivoId, conteo_id]);

  const handleConfirmar = async () => {
    try {
      let conteo: Conteo;
      if (modoConteo === "nuevo") {
        if (!variedadId) return Alert.alert("Selecciona una variedad");
        conteo = await crearConteo({
          cultivo_id: cultivoId,
          variedad_id: variedadId,
        });
      } else {
        if (!conteoSeleccionado) return Alert.alert("Selecciona un conteo");
        conteo = conteoSeleccionado;
      }
      setConteoSeleccionado(conteo);
      setTotalSurcos(conteo.total_surcos);
      const procs = await getProcesamientosPorConteo(conteo.id);
      const bloqueados = new Set<number>();
      procs.forEach((p) => {
        for (let s = p.surco_inicio; s <= p.surco_fin; s++) bloqueados.add(s);
      });
      setSurcosBloqueados(bloqueados);
      setPaso("subir");
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.response?.data?.detail ?? "Error al configurar el conteo.",
      );
    }
  };

  const handleSubir = async () => {
    if (!conteoSeleccionado || !videoFile) return;
    const inicio = parseInt(surcoInicio);
    const fin = parseInt(surcoFin);
    if (isNaN(inicio) || isNaN(fin) || fin < inicio)
      return Alert.alert(
        "Rango inválido",
        "El surco final debe ser mayor o igual al inicial.",
      );
    if (fin > totalSurcos)
      return Alert.alert(
        "Rango inválido",
        `El surco final no puede superar ${totalSurcos}.`,
      );
    for (let s = inicio; s <= fin; s++) {
      if (surcosBloqueados.has(s))
        return Alert.alert("Solapamiento", `El surco ${s} ya está cubierto.`);
    }
    setPaso("subiendo");
    try {
      const formData = new FormData();
      formData.append("conteo_id", String(conteoSeleccionado.id));
      formData.append("surco_inicio", surcoInicio);
      formData.append("surco_fin", surcoFin);
      formData.append("fecha_grabacion", new Date().toISOString());
      formData.append("video", {
        uri: videoFile.uri,
        name: videoFile.name,
        type: videoFile.mimeType ?? "video/mp4",
      } as any);
      const proc = await subirVideo(formData, setUploadProgress);
      router.replace(`/(app)/procesamiento/${proc.id}`);
    } catch (err: any) {
      setPaso("subir");
      Alert.alert(
        "Error al subir",
        err.response?.data?.detail ?? "Verifica tu conexión.",
      );
    }
  };

  if (loadingConfig)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );

  if (paso === "subiendo") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
        <Text style={styles.uploadTitle}>Subiendo video</Text>
        <Text style={styles.uploadPct}>{uploadProgress}%</Text>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${uploadProgress}%` }]}
          />
        </View>
        <Text style={styles.uploadHint}>No cierres la aplicación.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* PASO 1 — Configurar */}
      {paso === "configurar" && (
        <>
          <Text style={styles.stepLabel}>Paso 1 de 2 — Configurar conteo</Text>

          {conteosAbiertos.length > 0 && (
            <View style={styles.modeRow}>
              {(["existente", "nuevo"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.modeBtn,
                    modoConteo === m && styles.modeBtnActive,
                  ]}
                  onPress={() => setModoConteo(m)}
                >
                  <Text
                    style={[
                      styles.modeBtnText,
                      modoConteo === m && styles.modeBtnTextActive,
                    ]}
                  >
                    {m === "existente" ? "Continuar conteo" : "Nuevo conteo"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {modoConteo === "existente" && conteosAbiertos.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Conteo en progreso</Text>
              {conteosAbiertos.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.optionBtn,
                    conteoSeleccionado?.id === c.id && styles.optionBtnActive,
                  ]}
                  onPress={() => setConteoSeleccionado(c)}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.optionText,
                        conteoSeleccionado?.id === c.id &&
                          styles.optionTextActive,
                      ]}
                    >
                      Conteo #{c.id}
                    </Text>
                    <Text style={styles.optionSub}>
                      {new Date(c.fecha_conteo).toLocaleDateString("es-GT")} ·{" "}
                      {c.conteo_total_acumulado.toLocaleString()} melones
                    </Text>
                  </View>
                  {conteoSeleccionado?.id === c.id && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#2d6a4f"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {modoConteo === "nuevo" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Variedad de melón</Text>
              {variedades.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.optionBtn,
                    variedadId === v.id && styles.optionBtnActive,
                  ]}
                  onPress={() => setVariedadId(v.id)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      variedadId === v.id && styles.optionTextActive,
                    ]}
                  >
                    {v.nombre}
                  </Text>
                  {variedadId === v.id && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#2d6a4f"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleConfirmar}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>Continuar</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </>
      )}

      {/* PASO 2 — Subir video */}
      {paso === "subir" && conteoSeleccionado && (
        <>
          <Text style={styles.stepLabel}>Paso 2 de 2 — Subir video</Text>

          <View style={styles.conteoInfo}>
            <Text style={styles.conteoInfoLabel}>
              Conteo #{conteoSeleccionado.id}
            </Text>
            <Text style={styles.conteoInfoSub}>
              {surcosBloqueados.size} de {totalSurcos} surcos cubiertos
            </Text>
          </View>

          {/* Mapa de surcos */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Cobertura de surcos</Text>
            <View style={styles.surcoGrid}>
              {Array.from({ length: totalSurcos }, (_, i) => {
                const n = i + 1;
                const bloqueado = surcosBloqueados.has(n);
                const inicio = parseInt(surcoInicio);
                const fin = parseInt(surcoFin);
                const enRango =
                  !isNaN(inicio) && !isNaN(fin) && n >= inicio && n <= fin;
                const conflicto = bloqueado && enRango;
                return (
                  <View
                    key={n}
                    style={[
                      styles.surcoCell,
                      bloqueado && !conflicto && styles.surcoCubierto,
                      enRango && !conflicto && styles.surcoRango,
                      conflicto && styles.surcoConflicto,
                    ]}
                  >
                    <Text
                      style={[
                        styles.surcoCellText,
                        (bloqueado || enRango) && styles.surcoCellTextActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.surcoLegend}>
              <View
                style={[styles.legendDot, { backgroundColor: "#b7e4c7" }]}
              />
              <Text style={styles.legendText}>Cubierto</Text>
              <View
                style={[styles.legendDot, { backgroundColor: "#dcfce7" }]}
              />
              <Text style={styles.legendText}>Selección</Text>
              <View
                style={[styles.legendDot, { backgroundColor: "#fca5a5" }]}
              />
              <Text style={styles.legendText}>Conflicto</Text>
            </View>
          </View>

          {/* Rango */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Rango de surcos</Text>
            <View style={styles.rangoRow}>
              <View style={styles.rangoField}>
                <Text style={styles.rangoLabel}>Desde</Text>
                <TextInput
                  style={styles.rangoInput}
                  value={surcoInicio}
                  onChangeText={setSurcoInicio}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor="#a0b5a8"
                />
              </View>
              <Ionicons
                name="remove"
                size={20}
                color="#8fa898"
                style={{ marginTop: 24 }}
              />
              <View style={styles.rangoField}>
                <Text style={styles.rangoLabel}>Hasta</Text>
                <TextInput
                  style={styles.rangoInput}
                  value={surcoFin}
                  onChangeText={setSurcoFin}
                  keyboardType="number-pad"
                  placeholder={String(totalSurcos)}
                  placeholderTextColor="#a0b5a8"
                />
              </View>
            </View>
          </View>

          {/* Video */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Video del dron</Text>
            <TouchableOpacity
              style={styles.videoPicker}
              onPress={async () => {
                const result = await DocumentPicker.getDocumentAsync({
                  type: "video/*",
                  copyToCacheDirectory: true,
                });
                if (!result.canceled && result.assets.length > 0)
                  setVideoFile(result.assets[0]);
              }}
            >
              {videoFile ? (
                <View style={styles.videoSelected}>
                  <Ionicons name="videocam" size={20} color="#2d6a4f" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.videoNombre} numberOfLines={1}>
                      {videoFile.name}
                    </Text>
                    {videoFile.size && (
                      <Text style={styles.videoTamaño}>
                        {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                      </Text>
                    )}
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color="#2d6a4f" />
                </View>
              ) : (
                <View style={styles.videoEmpty}>
                  <Ionicons
                    name="cloud-upload-outline"
                    size={28}
                    color="#8fa898"
                  />
                  <Text style={styles.videoPickerText}>Seleccionar video</Text>
                  <Text style={styles.videoPickerHint}>
                    MP4, MOV — máx. recomendado 500 MB
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.btnPrimary,
              (!videoFile || !surcoInicio || !surcoFin) && styles.btnDisabled,
            ]}
            onPress={handleSubir}
            disabled={!videoFile || !surcoInicio || !surcoFin}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>Subir y procesar con IA</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f7f5" },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    padding: 32,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8fa898",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldGroup: { gap: 8 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5a7a6a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modeRow: { flexDirection: "row", gap: 10 },
  modeBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: "#e8f5ee", borderColor: "#2d6a4f" },
  modeBtnText: { fontSize: 13, fontWeight: "600", color: "#5a7a6a" },
  modeBtnTextActive: { color: "#2d6a4f" },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    backgroundColor: "#fff",
  },
  optionBtnActive: { backgroundColor: "#e8f5ee", borderColor: "#2d6a4f" },
  optionText: { fontSize: 14, color: "#5a7a6a", fontWeight: "600", flex: 1 },
  optionTextActive: { color: "#2d6a4f" },
  optionSub: { fontSize: 12, color: "#8fa898", marginTop: 2 },
  conteoInfo: {
    backgroundColor: "#2d6a4f",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  conteoInfoLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
  conteoInfoSub: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  surcoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  surcoCell: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#e8eeeb",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  surcoCubierto: { backgroundColor: "#b7e4c7", borderColor: "#52b788" },
  surcoRango: { backgroundColor: "#dcfce7", borderColor: "#86efac" },
  surcoConflicto: { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },
  surcoCellText: { fontSize: 9, fontWeight: "600", color: "#8fa898" },
  surcoCellTextActive: { color: "#1a2e25" },
  surcoLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: "#8fa898", marginRight: 8 },
  rangoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rangoField: { flex: 1, gap: 6 },
  rangoLabel: { fontSize: 12, fontWeight: "600", color: "#5a7a6a" },
  rangoInput: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: "#1a2e25",
    textAlign: "center",
    fontWeight: "700",
  },
  videoPicker: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#dde8e2",
    overflow: "hidden",
  },
  videoEmpty: { padding: 28, alignItems: "center", gap: 6 },
  videoSelected: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  videoNombre: { fontSize: 14, fontWeight: "600", color: "#1a2e25" },
  videoTamaño: { fontSize: 12, color: "#8fa898", marginTop: 2 },
  videoPickerText: { fontSize: 14, fontWeight: "600", color: "#2d6a4f" },
  videoPickerHint: { fontSize: 12, color: "#8fa898" },
  btnPrimary: {
    backgroundColor: "#2d6a4f",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  uploadTitle: { fontSize: 18, fontWeight: "700", color: "#1a2e25" },
  uploadPct: { fontSize: 40, fontWeight: "800", color: "#2d6a4f" },
  progressBar: {
    width: "80%",
    height: 6,
    backgroundColor: "#dde8e2",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2d6a4f",
    borderRadius: 99,
  },
  uploadHint: { fontSize: 12, color: "#8fa898" },
});
