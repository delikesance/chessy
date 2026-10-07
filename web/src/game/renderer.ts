// Choix du moteur de rendu du plateau, sans Phaser : testable seul.
// Le moteur WebGL de Phaser 4 ouvre un contexte WebGL 1 et lève une erreur au démarrage s'il lui manque ces
// extensions (Brave sous Linux, GPU sur liste noire, rendu logiciel…). Le plateau resterait alors vide : on les
// vérifie avant de créer le jeu et on se rabat sur le rendu Canvas 2D, qui dessine le même plateau.

/** Extensions WebGL 1 sans lesquelles `WebGLRenderer.setExtensions` lève une erreur. */
export const REQUIRED_WEBGL_EXTENSIONS = ["ANGLE_instanced_arrays", "OES_vertex_array_object"] as const;

export type BoardRenderer = "webgl" | "canvas";

type ProbeCanvas = { getContext(id: string): unknown };

/** `webgl` si un contexte WebGL 1 offre tout ce qu'il faut à Phaser, sinon `canvas`. */
export function pickRenderer(makeCanvas: () => ProbeCanvas = () => document.createElement("canvas")): BoardRenderer {
  try {
    const canvas = makeCanvas();
    const gl = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl || gl.isContextLost()) return "canvas";
    const exts = gl.getSupportedExtensions() ?? [];
    const ok = REQUIRED_WEBGL_EXTENSIONS.every((name) => exts.includes(name));
    // Rend tout de suite le contexte de sonde : les navigateurs en limitent le nombre.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return ok ? "webgl" : "canvas";
  } catch {
    return "canvas";
  }
}
