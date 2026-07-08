// Estado de red centralizado: una sola suscripción a NetInfo, con lectura síncrona y suscripción a cambios.

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

type Listener = (conectado: boolean) => void;

// Asumimos conexión al inicio para no bloquear la primera pantalla antes del primer dato de NetInfo.
let conectadoActual = true;
let inicializado = false;

const listeners = new Set<Listener>();

function derivarConectado(state: NetInfoState): boolean {
  // Usa isInternetReachable si NetInfo lo determinó; si es null, cae a isConnected.
  if (state.isInternetReachable === null) {
    return Boolean(state.isConnected);
  }
  return Boolean(state.isConnected) && Boolean(state.isInternetReachable);
}

function iniciar() {
  if (inicializado) return;
  inicializado = true;

  NetInfo.addEventListener((state) => {
    const nuevoEstado = derivarConectado(state);
    const cambio = nuevoEstado !== conectadoActual;
    conectadoActual = nuevoEstado;
    if (cambio) {
      listeners.forEach((fn) => fn(conectadoActual));
    }
  });

  // Primera lectura inmediata para no depender del primer evento del listener.
  NetInfo.fetch().then((state) => {
    conectadoActual = derivarConectado(state);
  });
}

/** Estado de conexión actual, de forma síncrona (mejor esfuerzo). */
export function hayConexion(): boolean {
  iniciar();
  return conectadoActual;
}

/** Se suscribe a cambios de conectividad (solo al cambiar); devuelve la función para desuscribirse. */
export function suscribirseAConexion(listener: Listener): () => void {
  iniciar();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Se suscribe solo a la transición sin-red → con-red (para disparar sincronización automática). */
export function alRecuperarConexion(callback: () => void): () => void {
  return suscribirseAConexion((conectado) => {
    if (conectado) callback();
  });
}
