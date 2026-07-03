//Estado de red centralizado
// Una sola suscripción a NetInfo para toda la app. Expone el estado actual
// de forma síncrona (útil para decidir "intento la red o voy directo al
// cache") y permite suscribirse a cambios (útil para el futuro motor de
// sincronización, que debe reaccionar exactamente cuando se recupera la
// conexión, no solo cuando un componente de UI está montado).

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

type Listener = (conectado: boolean) => void;

// Empezamos asumiendo que sí hay conexión: es la suposición más segura para
// no bloquear la primera pantalla mientras NetInfo entrega su primer
// resultado real (que llega de forma asíncrona, normalmente en milisegundos).
let conectadoActual = true;
let inicializado = false;

const listeners = new Set<Listener>();

function derivarConectado(state: NetInfoState): boolean {
  // isConnected indica que hay una interfaz de red activa (wifi/datos). isInternetReachable, cuando NetInfo logra determinarlo,
  //es más preciso (detecta wifi conectado pero sin salida a internet). Si es null (aún no determinado), queda con isConnected para no ser demasiado pesimista
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

  // Forzamos una primera lectura inmediata en vez de esperar al primer
  // evento del listener, para reducir la ventana en la que conectadoActual
  // podría estar desactualizado.
  NetInfo.fetch().then((state) => {
    conectadoActual = derivarConectado(state);
  });
}

/** Estado de conexión actual, de forma síncrona (mejor esfuerzo). */
export function hayConexion(): boolean {
  iniciar();
  return conectadoActual;
}

/*
Se suscribe a cambios de conectividad. El callback se invoca solo cuando el estado cambia (no en cada evento nativo). Devuelve una función para desuscribirse.
 */
export function suscribirseAConexion(listener: Listener): () => void {
  iniciar();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/*
Se suscribe únicamente al evento de "se recuperó la conexión" (transición de sin-red a con-red). Pensado para disparar la
sincronización automática sin que cada consumidor tenga que comparar el valor anterior manualmente.
 */
export function alRecuperarConexion(callback: () => void): () => void {
  return suscribirseAConexion((conectado) => {
    if (conectado) callback();
  });
}
