// ─── Registro global de subidas activas ─────────────────────────────────────
// Evita que dos pantallas (nuevo.tsx y procesamiento/[id].tsx) disparen
// subidas duplicadas del mismo video, y permite que cualquier pantalla que
// se monte pueda "engancharse" al progreso de una subida que ya está
// corriendo en memoria, sin importar si llegó ahí por navegación directa
// (con el param subidaEnCurso) o por volver a entrar más tarde.

type Listener = (pct: number) => void;

interface SubidaActiva {
  promise: Promise<void>;
  cancelar: () => Promise<void>;
  progresoActual: number;
  listeners: Set<Listener>;
}

const subidasActivas = new Map<number, SubidaActiva>();

/**
 * Registra una subida ya iniciada (promise + cancelar) para que otras
 * pantallas puedan suscribirse a su progreso en lugar de lanzar una nueva.
 */
export function registrarSubidaActiva(
  procesamientoId: number,
  promise: Promise<void>,
  cancelar: () => Promise<void>,
): (pct: number) => void {
  const entry: SubidaActiva = {
    promise,
    cancelar,
    progresoActual: 0,
    listeners: new Set(),
  };
  subidasActivas.set(procesamientoId, entry);

  // Limpieza automática al terminar (éxito o error)
  promise.finally(() => {
    // Solo limpiamos si sigue siendo la misma entrada (por si se reemplazó)
    if (subidasActivas.get(procesamientoId) === entry) {
      subidasActivas.delete(procesamientoId);
    }
  });

  // Devuelve la función que el llamador debe usar como onProgress
  // para alimentar este registro (y así propagar a todos los listeners).
  return (pct: number) => {
    entry.progresoActual = pct;
    entry.listeners.forEach((fn) => fn(pct));
  };
}

/** True si hay una subida en memoria activa para ese procesamiento. */
export function haySubidaActiva(procesamientoId: number): boolean {
  return subidasActivas.has(procesamientoId);
}

/**
 * Suscribe un listener al progreso de una subida ya activa en memoria.
 * Devuelve null si no hay ninguna subida activa para ese id.
 * El callback onProgress se invoca inmediatamente con el progreso actual,
 * y luego en cada actualización. También se resuelve/rechaza igual que la
 * promise original (útil para mostrar errores o limpiar el estado).
 */
export function suscribirseASubidaActiva(
  procesamientoId: number,
  onProgress: (pct: number) => void,
): {
  promise: Promise<void>;
  cancelar: () => Promise<void>;
  desuscribir: () => void;
} | null {
  const entry = subidasActivas.get(procesamientoId);
  if (!entry) return null;

  entry.listeners.add(onProgress);
  // Emitir el valor actual de inmediato para que la UI no arranque en 0
  // si la subida ya llevaba avance.
  onProgress(entry.progresoActual);

  const desuscribir = () => {
    entry.listeners.delete(onProgress);
  };

  return { promise: entry.promise, cancelar: entry.cancelar, desuscribir };
}

export function quitarSubidaActiva(procesamientoId: number): void {
  subidasActivas.delete(procesamientoId);
}
