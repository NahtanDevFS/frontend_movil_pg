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
  cultivo_id: number;
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

//registra sin archivo, responde inmediatamente con el id
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

//sube el archivo en background con expo-file-system
export const subirVideoBackground = async (
  procesamientoId: number,
  videoUri: string,
  token: string,
  onProgress?: (pct: number) => void,
): Promise<void> => {
  const apiUrl = Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:8000";
  const uploadUrl = `${apiUrl}/procesamientos/${procesamientoId}/video`;

  const task = FileSystem.createUploadTask(
    uploadUrl,
    videoUri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "video",
      headers: { Authorization: `Bearer ${token}` },
    },
    (progress) => {
      if (onProgress && progress.totalBytesExpectedToSend > 0) {
        const pct = Math.round(
          (progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100,
        );
        onProgress(pct);
      }
    },
  );

  const result = await task.uploadAsync();
  if (!result || result.status >= 400) {
    throw new Error("Error al subir el video.");
  }
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
  // Devuelve la URL directa para descargar con el token en header
  // Se usa con expo-file-system para la descarga autenticada
  return `/procesamientos/${procesamientoId}/video-anotado`;
};
