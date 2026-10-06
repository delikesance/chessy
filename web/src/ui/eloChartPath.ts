// Géométrie pure de la courbe d'Elo (testable sans DOM).

export interface ChartPoint {
  x: number;
  y: number;
  elo: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  /** Valeur de l'attribut `points` d'un `<polyline>`. */
  polyline: string;
  min: number;
  max: number;
}

export interface ChartBox {
  width: number;
  height: number;
  padX: number;
  padY: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Convertit une série d'Elo en points SVG. Les points sont espacés régulièrement
 * (une partie = un pas). Une série d'un seul point devient une droite horizontale.
 */
export function buildChart(elos: number[], box: ChartBox): ChartGeometry | null {
  if (elos.length === 0) return null;
  const series = elos.length === 1 ? [elos[0], elos[0]] : elos;
  let lo = Math.min(...series);
  let hi = Math.max(...series);
  if (hi - lo < 40) {
    const mid = (hi + lo) / 2;
    lo = mid - 20;
    hi = mid + 20;
  }
  const innerW = box.width - box.padX * 2;
  const innerH = box.height - box.padY * 2;
  const points = series.map((elo, i) => ({
    x: r1(box.padX + (innerW * i) / (series.length - 1)),
    y: r1(box.padY + innerH * (1 - (elo - lo) / (hi - lo))),
    elo,
  }));
  return {
    points,
    polyline: points.map((p) => `${p.x},${p.y}`).join(" "),
    min: Math.min(...elos),
    max: Math.max(...elos),
  };
}
