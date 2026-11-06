import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";

const COLS = 10;
const GRID_PADDING = 10;
const GAP = 3;
const VISIBLE_ROWS = 4;

interface Props {
  totalSurcos: number;
  bloqueados: Set<number>;
  surcoInicio: string;
  surcoFin: string;
  // espacio horizontal que ocupa la pantalla a cada lado de la grilla
  margenLateral: number;
}

// grilla de surcos del conteo: los ya cubiertos, el rango elegido y los choques entre ambos
export default function SurcoGrid({
  totalSurcos,
  bloqueados,
  surcoInicio,
  surcoFin,
  margenLateral,
}: Props) {
  const ancho = Dimensions.get("window").width - margenLateral * 2;
  const celda = Math.floor((ancho - GRID_PADDING * 2 - GAP * (COLS - 1)) / COLS);
  const altoMaximo =
    VISIBLE_ROWS * celda + (VISIBLE_ROWS - 1) * GAP + GRID_PADDING * 3;
  const inicio = parseInt(surcoInicio);
  const fin = parseInt(surcoFin);

  return (
    <>
      <ScrollView
        style={[styles.wrapper, { maxHeight: altoMaximo }]}
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        <View style={styles.grid}>
          {Array.from({ length: totalSurcos }, (_, i) => {
            const n = i + 1;
            const bloqueado = bloqueados.has(n);
            const enRango =
              !isNaN(inicio) && !isNaN(fin) && n >= inicio && n <= fin;
            const conflicto = bloqueado && enRango;
            return (
              <View
                key={n}
                style={[
                  styles.cell,
                  { width: celda, height: celda },
                  bloqueado && !conflicto && styles.cubierto,
                  enRango && !conflicto && styles.rango,
                  conflicto && styles.conflicto,
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    (bloqueado || enRango) && styles.cellTextActive,
                  ]}
                >
                  {n}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: "#b7e4c7" }]} />
        <Text style={styles.legendText}>Cubierto</Text>
        <View style={[styles.legendDot, { backgroundColor: "#dcfce7" }]} />
        <Text style={styles.legendText}>Selección</Text>
        <View style={[styles.legendDot, { backgroundColor: "#fca5a5" }]} />
        <Text style={styles.legendText}>Conflicto</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#dde8e2",
  },
  content: { padding: GRID_PADDING },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  cell: {
    borderRadius: 5,
    backgroundColor: "#e8eeeb",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dde8e2",
  },
  cubierto: { backgroundColor: "#b7e4c7", borderColor: "#52b788" },
  rango: { backgroundColor: "#dcfce7", borderColor: "#86efac" },
  conflicto: { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },
  cellText: { fontSize: 8, fontWeight: "600", color: "#8fa898" },
  cellTextActive: { color: "#1a2e25" },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: "#8fa898", marginRight: 8 },
});
