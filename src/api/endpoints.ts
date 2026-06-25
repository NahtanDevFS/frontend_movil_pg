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

// Resultado de iniciar una subida: la promesa que resuelve/rechaza al
// terminar, y una función para cancelarla manualmente.
export interface SubidaControlada {
  promise: Promise<void>;
  cancelar: () => Promise<void>;
}

// Timeout de subida: si los bytes enviados no avanzan en este tiempo, se aborta.
const SUBIDA_TIMEOUT_SIN_AVANCE_MS = 5 * 60 * 1000; // 5 minutos

export const subirVideoBackground = (
  procesamientoId: number,
  videoUri: string,
  token: string,
  onProgress?: (pct: number) => void,
): SubidaControlada => {
  const apiUrl =
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    "http://localhost:8000";
  const uploadUrl = `${apiUrl}/procesamientos/${procesamientoId}/video`;

  let cancelado = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ultimoBytes = 0;

  const task = FileSystem.createUploadTask(
    uploadUrl,
    videoUri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "video",
      headers: {
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
      },
    },
    (progress) => {
      if (progress.totalBytesExpectedToSend > 0) {
        // Reinicia el timeout cada vez que avanzan los bytes
        if (progress.totalBytesSent > ultimoBytes) {
          ultimoBytes = progress.totalBytesSent;
          reiniciarTimeout();
        }
        if (onProgress) {
          const pct = Math.round(
            (progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100,
          );
          onProgress(pct);
        }
      }
    },
  );

  const limpiarTimeout = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // Promesa de timeout: rechaza si pasa demasiado sin avance
  let rechazarPorTimeout: ((e: Error) => void) | null = null;
  const reiniciarTimeout = () => {
    limpiarTimeout();
    timer = setTimeout(async () => {
      cancelado = true;
      try {
        await task.cancelAsync();
      } catch {
        // ignorar
      }
      if (rechazarPorTimeout) {
        rechazarPorTimeout(
          new Error(
            "La subida se detuvo: no hubo avance en 5 minutos. Revisa tu conexión e inténtalo de nuevo.",
          ),
        );
      }
    }, SUBIDA_TIMEOUT_SIN_AVANCE_MS);
  };

  const promise = new Promise<void>((resolve, reject) => {
    rechazarPorTimeout = reject;
    reiniciarTimeout(); // arranca el contador
    task
      .uploadAsync()
      .then((result) => {
        limpiarTimeout();
        if (cancelado) {
          reject(new Error("Subida cancelada."));
          return;
        }
        if (!result || result.status >= 400) {
          reject(
            new Error(`Error al subir el video. Status: ${result?.status}`),
          );
          return;
        }
        resolve();
      })
      .catch((err) => {
        limpiarTimeout();
        if (cancelado) {
          reject(new Error("Subida cancelada."));
        } else {
          reject(err);
        }
      });
  });

  const cancelar = async () => {
    cancelado = true;
    limpiarTimeout();
    try {
      await task.cancelAsync();
    } catch {
      // ignorar
    }
  };

  return { promise, cancelar };
};

// Cancela/anula un procesamiento (operador dueño, solo pendiente/procesando)
export const cancelarProcesamiento = async (procesamientoId: number) => {
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
