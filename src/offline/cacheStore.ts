//Cache genérico de solo lectura
// Guarda la última copia conocida de cualquier dato de servidor (catálogos, listados) en AsyncStorage, junto con la fecha en que se guardó. Pensado
// para el patrón "network-first con fallback a cache": intenta la red y, si falla, usa lo último que se guardó — sin bloquear la UI ni pedirle nada al operador.
// No es exclusivo de catálogos: cualquier GET de la app puede usar esto,
// pero por ahora solo lo usamos para variedades, calibres y cultivos (ver src/api/endpoints.ts).

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIJO = "cache:";

interface EntradaCache<T> {
  valor: T;
  guardadoEn: string; // ISO timestamp
}

async function guardar<T>(clave: string, valor: T): Promise<void> {
  try {
    const entrada: EntradaCache<T> = {
      valor,
      guardadoEn: new Date().toISOString(),
    };
    await AsyncStorage.setItem(PREFIJO + clave, JSON.stringify(entrada));
  } catch {
    //El cache es una mejora de experiencia, no algo crítico
  }
}

async function leer<T>(clave: string): Promise<EntradaCache<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIJO + clave);
    if (!raw) return null;
    return JSON.parse(raw) as EntradaCache<T>;
  } catch {
    return null;
  }
}

/*
 * Ejecuta `fetcher` (la llamada real al servidor). Si tiene éxito, guarda el resultado en cache y lo devuelve. Si falla, intenta devolver la última
copia guardada en cache, si tampoco hay cache, relanza el error original para que la pantalla lo maneje como siempre (mostrar alerta).
`huboError` permite a quien llama distinguir si el resultado vino de la red (fresco) o del cache (posiblemente desactualizado)
*/
export async function conCacheDeRespaldo<T>(
  clave: string,
  fetcher: () => Promise<T>,
): Promise<{ datos: T; deCache: boolean; guardadoEn: string | null }> {
  try {
    const datos = await fetcher();
    await guardar(clave, datos);
    return { datos, deCache: false, guardadoEn: null };
  } catch (err) {
    const entrada = await leer<T>(clave);
    if (entrada) {
      return {
        datos: entrada.valor,
        deCache: true,
        guardadoEn: entrada.guardadoEn,
      };
    }
    throw err;
  }
}

//lee el cache directamente, sin intentar la red. Útil para casos donde ya se sabe que no hay conexión (ver hayConexion() en networkStatus)
export async function leerCache<T>(
  clave: string,
): Promise<{ valor: T; guardadoEn: string } | null> {
  const entrada = await leer<T>(clave);
  if (!entrada) return null;
  return { valor: entrada.valor, guardadoEn: entrada.guardadoEn };
}
