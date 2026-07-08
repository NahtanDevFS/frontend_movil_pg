// hook de React que da el estado de conexion, reutiliza la suscripcion central de networkStatus (no crea otra)

import { useEffect, useState } from "react";
import { hayConexion, suscribirseAConexion } from "./networkStatus";

export function useNetworkStatus(): boolean {
  const [conectado, setConectado] = useState(hayConexion());

  useEffect(() => {
    // releemos al montar por si cambio entre el useState inicial y el efecto
    setConectado(hayConexion());
    return suscribirseAConexion(setConectado);
  }, []);

  return conectado;
}
