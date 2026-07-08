// estado de red central: una sola suscripcion a NetInfo, con lectura sincrona y aviso de cambios

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

type Listener = (conectado: boolean) => void;

// arrancamos asumiendo que hay conexion pa no trabar la primera pantalla antes de que NetInfo diga la verdad
let conectadoActual = true;
let inicializado = false;

const listeners = new Set<Listener>();

function derivarConectado(state: NetInfoState): boolean {
  // si NetInfo ya sabe si hay internet de verdad usamos eso, si viene null nos quedamos con isConnected
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

  // una primera lectura de una pa no esperar al primer evento del listener
  NetInfo.fetch().then((state) => {
    conectadoActual = derivarConectado(state);
  });
}

// dice si hay conexion ahorita mismo, sincrono (mejor esfuerzo)
export function hayConexion(): boolean {
  iniciar();
  return conectadoActual;
}

// se suscribe a los cambios de conexion (solo cuando cambia), devuelve la funcion pa desuscribirse
export function suscribirseAConexion(listener: Listener): () => void {
  iniciar();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// se suscribe solo al momento en que vuelve la conexion (pasar de sin-red a con-red), util pa sincronizar solo
export function alRecuperarConexion(callback: () => void): () => void {
  return suscribirseAConexion((conectado) => {
    if (conectado) callback();
  });
}
