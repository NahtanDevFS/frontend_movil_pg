//Catálogos
export interface Rol {
  id: number;
  nombre: string;
}

export interface Variedad {
  id: number;
  nombre: string;
  descripcion: string | null;
}

export interface Calibre {
  id: number;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

//Usuarios
export interface Usuario {
  id: number;
  nombre: string;
  rol_id: number;
  activo: boolean;
  created_at: string;
}

//Cultivos
export interface Cultivo {
  id: number;
  usuario_id: number;
  nombre: string;
  municipio_id: number;
  // nombres desnormalizados que el backend ya resuelve
  municipio_nombre: string;
  departamento_id: number;
  departamento_nombre: string;
  // ubicacion: dirección/referencia libre dentro del municipio (opcional)
  ubicacion: string | null;
  hectareas: number | null;
  total_surcos: number;
  activo: boolean;
  created_at: string;
}

// Catálogos geográficos
export interface Departamento {
  id: number;
  nombre: string;
}

export interface Municipio {
  id: number;
  nombre: string;
  departamento_id: number;
}

//Conteos
export interface Conteo {
  id: number;
  campo_cultivo_id: number;
  variedad_id: number;
  estado_id: number;
  fecha_conteo: string;
  total_surcos: number;
  conteo_total_acumulado: number;
  // nivel derivado por el backend a partir de las métricas agregadas de la sesión
  nivel_confiabilidad: "alto" | "moderado" | "bajo" | null;
  promedio_confianza_sesion: number | null;
  porcentaje_baja_confianza_sesion: number | null;
  observaciones: string | null;
  activo: boolean;
  created_at: string;
}

//Procesamientos
export interface ResultadoIa {
  id: number;
  conteo_ia: number;
  conteo_ajustado: number | null;
  observaciones_ajuste: string | null;
  tiempo_procesamiento_seg: number | null;
  promedio_confianza: number | null;
  porcentaje_baja_confianza: number | null;
  // nivel derivado por el backend a partir de las métricas de este video
  nivel_confiabilidad: "alto" | "moderado" | "bajo" | null;
  total_frames_procesados: number | null;
}

export interface ProcesamientoVideo {
  id: number;
  conteo_id: number;
  usuario_id: number;
  estado_id: number;
  // nombre legible del estado: 'pendiente' | 'procesando' | 'completado' | 'error' | 'cancelado'
  estado_nombre: string | null;
  surco_inicio: number;
  surco_fin: number;
  video_original_url: string;
  video_anotado_url: string | null;
  fecha_grabacion: string;
  created_at: string;
  resultado: ResultadoIa | null;
}

//Muestreo / Calibres
export interface ClasificacionCalibre {
  id: number;
  calibre_id: number;
  nombre_calibre: string;
  orden_calibre: number;
  cantidad_muestreo: number;
  total_muestreo: number;
  porcentaje: number;
  cantidad_extrapolada: number;
}

export interface MuestreoResponse {
  total_muestreo: number;
  conteo_total_acumulado: number;
  clasificaciones: ClasificacionCalibre[];
}

//Comparación anterior
export interface ComparacionAnterior {
  conteo_anterior_id: number | null;
  conteo_anterior_total: number | null;
  conteo_anterior_fecha: string | null;
  variacion_porcentual: number | null;
  hay_historial: boolean;
}
