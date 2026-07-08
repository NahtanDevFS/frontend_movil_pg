// registro global de las subidas activas: evita que dos pantallas suban lo mismo y deja que cualquiera se enganche al progreso

type Listener = (pct: number) => void;

interface SubidaActiva {
  promise: Promise<void>;
  cancelar: () => Promise<void>;
  progresoActual: number;
  listeners: Set<Listener>;
}

const subidasActivas = new Map<number, SubidaActiva>();

// registra una subida ya arrancada pa que otras pantallas se suscriban en vez de lanzar otra
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

  // al terminar (bien o mal) se limpia solo
  promise.finally(() => {
    // solo si sigue siendo la misma entrada, por si la reemplazaron
    if (subidasActivas.get(procesamientoId) === entry) {
      subidasActivas.delete(procesamientoId);
    }
  });

  // devuelve el onProgress que alimenta este registro y avisa a todos los listeners
  return (pct: number) => {
    entry.progresoActual = pct;
    entry.listeners.forEach((fn) => fn(pct));
  };
}

// true si hay una subida viva en memoria pa ese procesamiento
export function haySubidaActiva(procesamientoId: number): boolean {
  return subidasActivas.has(procesamientoId);
}

// suscribe un listener al progreso de una subida activa, devuelve null si no hay ninguna pa ese id
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
  // le pasamos el valor actual de una, pa que la UI no arranque en 0 si la subida ya llevaba avance
  onProgress(entry.progresoActual);

  const desuscribir = () => {
    entry.listeners.delete(onProgress);
  };

  return { promise: entry.promise, cancelar: entry.cancelar, desuscribir };
}

export function quitarSubidaActiva(procesamientoId: number): void {
  subidasActivas.delete(procesamientoId);
}
