//Hook de React para el estado de conexión
// Envuelve networkStatus.ts para componentes de UI (banners, badges, etc).
// No inicia su propia suscripción a NetInfo: reutiliza la centralizada.

import { useEffect, useState } from "react";
import { hayConexion, suscribirseAConexion } from "./networkStatus";

export function useNetworkStatus(): boolean {
  const [conectado, setConectado] = useState(hayConexion());

  useEffect(() => {
    // Releer al montar por si cambió entre el useState inicial y el efecto.
    setConectado(hayConexion());
    return suscribirseAConexion(setConectado);
  }, []);

  return conectado;
}
