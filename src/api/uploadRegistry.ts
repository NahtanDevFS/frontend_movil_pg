// Registro global de subidas activas: evita subidas duplicadas y deja que cualquier pantalla se enganche a su progreso.

type Listener = (pct: number) => void;

interface SubidaActiva {
  promise: Promise<void>;
  cancelar: () => Promise<void>;
  progresoActual: number;
  listeners: Set<Listener>;
}

const subidasActivas = new Map<number, SubidaActiva>();

/** Registra una subida iniciada para que otras pantallas se suscriban en vez de lanzar otra. */
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

  // Devuelve el onProgress que alimenta este registro y propaga a los listeners.
  return (pct: number) => {
    entry.progresoActual = pct;
    entry.listeners.forEach((fn) => fn(pct));
  };
}

/** True si hay una subida en memoria activa para ese procesamiento. */
export function haySubidaActiva(procesamientoId: number): boolean {
  return subidasActivas.has(procesamientoId);
}

/** Suscribe un listener al progreso de una subida activa; null si no hay ninguna para ese id. */
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
  // Emite el valor actual de inmediato para que la UI no arranque en 0.
  onProgress(entry.progresoActual);

  const desuscribir = () => {
    entry.listeners.delete(onProgress);
  };

  return { promise: entry.promise, cancelar: entry.cancelar, desuscribir };
}

export function quitarSubidaActiva(procesamientoId: number): void {
  subidasActivas.delete(procesamientoId);
}
