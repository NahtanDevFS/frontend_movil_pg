// Cache genérico de solo lectura en AsyncStorage para el patrón network-first con fallback a cache.

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

/** Ejecuta el fetcher y cachea el resultado; si falla, devuelve la última copia de cache o relanza el error. */
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

// Lee el cache directamente, sin intentar la red (para cuando ya se sabe que no hay conexión).
export async function leerCache<T>(
  clave: string,
): Promise<{ valor: T; guardadoEn: string } | null> {
  const entrada = await leer<T>(clave);
  if (!entrada) return null;
  return { valor: entrada.valor, guardadoEn: entrada.guardadoEn };
}
