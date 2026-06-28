import client from "./client";
import {
  Cultivo,
  Conteo,
  ProcesamientoVideo,
  MuestreoResponse,
  ComparacionAnterior,
  Variedad,
  Calibre,
} from "../types";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { TOKEN_KEY } from "./client";

//Auth
export const login = async (nombre: string, password: string) => {
  const params = new URLSearchParams();
  params.append("username", nombre);
  params.append("password", password);
  const res = await client.post("/login", params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data as { access_token: string; token_type: string };
};

export const getMe = async () => {
  const res = await client.get("/usuarios/me");
  return res.data;
};

export const cambiarPasswordPropia = async (
  passwordActual: string,
  passwordNueva: string,
) => {
  const res = await client.patch("/usuarios/me/password", {
    password_actual: passwordActual,
    password_nueva: passwordNueva,
  });
  return res.data;
};

//Cultivos
export const getCultivos = async (): Promise<Cultivo[]> => {
  const res = await client.get("/cultivos/");
  return res.data;
};

//Catálogos
export const getVariedades = async (): Promise<Variedad[]> => {
  const res = await client.get("/catalogos/variedades");
  return res.data;
};

export const getCalibresPorVariedad = async (
  variedadId: number,
): Promise<Calibre[]> => {
  const res = await client.get(`/catalogos/variedades/${variedadId}/calibres`);
  return res.data;
};

//Conteos
export const getConteosPorCultivo = async (
  cultivoId: number,
  params?: {
    fecha_desde?: string;
    fecha_hasta?: string;
    estado?: "en_progreso" | "completado";
    skip?: number;
    limit?: number;
  },
): Promise<Conteo[]> => {
  const res = await client.get(`/conteos/cultivo/${cultivoId}`, { params });
  return res.data;
};
export const getConteo = async (conteoId: number): Promise<Conteo> => {
  const res = await client.get(`/conteos/${conteoId}`);
  return res.data;
};

export const crearConteo = async (data: {
  campo_cultivo_id: number;
  variedad_id: number;
}): Promise<Conteo> => {
  const res = await client.post("/conteos/", data);
  return res.data;
};

export const completarConteo = async (conteoId: number) => {
  const res = await client.patch(`/conteos/${conteoId}/completar`);
  return res.data;
};

export const getComparacionAnterior = async (
  conteoId: number,
): Promise<ComparacionAnterior> => {
  const res = await client.get(`/conteos/${conteoId}/comparacion-anterior`);
  return res.data;
};

export const getMuestreo = async (
  conteoId: number,
): Promise<MuestreoResponse> => {
  const res = await client.get(`/conteos/${conteoId}/muestreo`);
  return res.data;
};

export const guardarMuestreo = async (
  conteoId: number,
  data: {
    total_muestreo: number;
    items: { calibre_id: number; cantidad_muestreo: number }[];
  },
): Promise<MuestreoResponse> => {
  const res = await client.post(`/conteos/${conteoId}/muestreo`, data);
  return res.data;
};

//Procesamientos
export const getProcesamientosPorConteo = async (
  conteoId: number,
): Promise<ProcesamientoVideo[]> => {
  const res = await client.get(`/procesamientos/conteo/${conteoId}`);
  return res.data;
};

export const getProcesamiento = async (
  id: number,
): Promise<ProcesamientoVideo> => {
  const res = await client.get(`/procesamientos/${id}`);
  return res.data;
};

//registra el procesamiento sin archivo, devuelve el id inmediatamente
export const registrarProcesamiento = async (data: {
  conteo_id: number;
  surco_inicio: number;
  surco_fin: number;
  fecha_grabacion: string;
}): Promise<ProcesamientoVideo> => {
  const form = new FormData();
  form.append("conteo_id", String(data.conteo_id));
  form.append("surco_inicio", String(data.surco_inicio));
  form.append("surco_fin", String(data.surco_fin));
  form.append("fecha_grabacion", data.fecha_grabacion);
  const res = await client.post("/procesamientos/registrar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

// ─── Subida por chunks con retry automático ─────────────────────────────────

// Tamaño de cada chunk: 5 MB
const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

// Intentos máximos por chunk antes de rendirse
const MAX_REINTENTOS = 3;

// Backoff base en ms (se duplica por cada reintento: 2s, 4s, 8s)
const BACKOFF_BASE_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SubidaControlada {
  promise: Promise<void>;
  cancelar: () => Promise<void>;
}

export const subirVideoBackground = (
  procesamientoId: number,
  videoUri: string,
  token: string,
  onProgress?: (pct: number) => void,
  mimeType?: string,
): SubidaControlada => {
  const apiUrl =
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    "http://localhost:8000";

  let cancelado = false;

  const cancelar = async () => {
    cancelado = true;
  };

  const promise = (async () => {
    // 1. Copiar al cacheDirectory para garantizar acceso con file:// en ambas plataformas.
    //    DocumentPicker en Android devuelve content:// que readAsStringAsync no soporta.
    const extension = (() => {
      if (mimeType) {
        const mimeMap: Record<string, string> = {
          "video/mp4": "mp4",
          "video/quicktime": "mov",
          "video/x-msvideo": "avi",
          "video/x-matroska": "mkv",
          "video/mov": "mov",
        };
        return mimeMap[mimeType.toLowerCase()] ?? "mp4";
      }
      const uriLimpio = videoUri.split("?")[0];
      const partes = uriLimpio.split(".");
      if (partes.length > 1) {
        const ext = partes.pop()!.toLowerCase();
        if (["mp4", "mov", "avi", "mkv"].includes(ext)) return ext;
      }
      return "mp4";
    })();

    const uriLocal = `${FileSystem.cacheDirectory}upload_${procesamientoId}.${extension}`;
    await FileSystem.copyAsync({ from: videoUri, to: uriLocal });

    if (cancelado) throw new Error("Subida cancelada.");

    // 2. Obtener tamaño real del archivo copiado (file:// garantiza .size correcto)
    const info = await FileSystem.getInfoAsync(uriLocal);
    if (!info.exists) throw new Error("No se pudo copiar el archivo al cache.");
    const totalBytes = (info as any).size as number;
    if (!totalBytes)
      throw new Error("No se pudo determinar el tamaño del video.");

    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE_BYTES);

    // 3. Registrar metadatos en el servidor
    const authHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "true",
    };

    const initRes = await fetch(
      `${apiUrl}/procesamientos/${procesamientoId}/video/iniciar-chunks`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ extension, total_chunks: totalChunks }),
      },
    );
    if (!initRes.ok) {
      const errBody = await initRes.json().catch(() => ({}));
      throw new Error(
        errBody?.detail ?? `Error al iniciar subida (${initRes.status})`,
      );
    }

    if (cancelado) throw new Error("Subida cancelada.");

    // 4. Consultar desde qué chunk reanudar
    let desdeChunk = 0;
    try {
      const estadoRes = await fetch(
        `${apiUrl}/procesamientos/${procesamientoId}/video/estado-subida`,
        { headers: authHeaders },
      );
      if (estadoRes.ok) {
        const estado = await estadoRes.json();
        const ultimo: number = estado.ultimo_chunk_recibido ?? -1;
        if (ultimo >= 0 && ultimo < totalChunks - 1) {
          desdeChunk = ultimo + 1;
          if (onProgress)
            onProgress(Math.round((desdeChunk / totalChunks) * 100));
        }
      }
    } catch {
      // Si falla, empezamos desde 0
    }

    // 5. Enviar chunk a chunk usando readAsStringAsync con position en bytes
    //    Funciona correctamente en file:// (ya copiamos el archivo al cache)
    for (let i = desdeChunk; i < totalChunks; i++) {
      if (cancelado) throw new Error("Subida cancelada.");

      const offset = i * CHUNK_SIZE_BYTES;
      const length = Math.min(CHUNK_SIZE_BYTES, totalBytes - offset);

      const b64 = await FileSystem.readAsStringAsync(uriLocal, {
        encoding: FileSystem.EncodingType.Base64,
        position: offset,
        length,
      });

      // Retry con backoff exponencial
      let intentos = 0;
      let completo = false;
      let enviado = false;
      while (!enviado && intentos < MAX_REINTENTOS) {
        if (cancelado) throw new Error("Subida cancelada.");
        try {
          const formBody = new FormData();
          formBody.append("numero", String(i));
          formBody.append("data_b64", b64);

          const chunkRes = await fetch(
            `${apiUrl}/procesamientos/${procesamientoId}/video/chunk`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "ngrok-skip-browser-warning": "true",
              },
              body: formBody,
            },
          );

          if (!chunkRes.ok) {
            const errBody = await chunkRes.json().catch(() => ({}));
            throw new Error(
              errBody?.detail ?? `Error en chunk ${i} (${chunkRes.status})`,
            );
          }

          const respJson = await chunkRes.json().catch(() => ({}));
          enviado = true;
          // Si el servidor confirmó que recibió el último chunk y ensambló, salimos
          if (respJson?.completo === true) completo = true;
        } catch (err) {
          intentos++;
          if (intentos >= MAX_REINTENTOS) throw err;
          await sleep(BACKOFF_BASE_MS * Math.pow(2, intentos - 1));
        }
      }

      if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100));

      // Si el servidor ya ensambló (último chunk confirmado), no hay más nada que enviar
      if (completo) break;
    }

    // 6. Limpiar el archivo temporal del cache
    try {
      await FileSystem.deleteAsync(uriLocal, { idempotent: true });
    } catch {
      // ignorar, no es crítico
    }
  })();

  return { promise, cancelar };
};

// Cancela/anula un procesamiento (operador dueño, solo pendiente/procesando)
export const cancelarProcesamiento = async (procesamientoId: number) => {
  const res = await client.patch(`/procesamientos/${procesamientoId}/cancelar`);
  return res.data;
};

// Cancela un procesamiento ya completado (mismo endpoint, ahora el backend lo permite)
// Se exporta con nombre semántico distinto para que la UI lo diferencie claramente
export const anularProcesamientoCompletado = async (
  procesamientoId: number,
) => {
  const res = await client.patch(`/procesamientos/${procesamientoId}/cancelar`);
  return res.data;
};

export const ajustarConteo = async (
  procesamientoId: number,
  data: { conteo_ajustado: number; observaciones?: string },
) => {
  const res = await client.post(
    `/procesamientos/${procesamientoId}/ajustar`,
    data,
  );
  return res.data;
};

export const getVideoAnotadoUrl = (procesamientoId: number): string => {
  return `/procesamientos/${procesamientoId}/video-anotado`;
};

export interface ProgresoProcesamiento {
  progreso_pct: number;
  conteo_parcial: number;
  disponible: boolean;
}

export const getProgreso = async (
  id: number,
): Promise<ProgresoProcesamiento> => {
  const res = await client.get(`/procesamientos/${id}/progreso`);
  return res.data;
};
