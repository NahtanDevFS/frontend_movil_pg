// Hook de React que expone el estado de conexión, reutilizando la suscripción central de networkStatus.

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
