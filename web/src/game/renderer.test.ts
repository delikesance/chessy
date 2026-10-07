import { describe, expect, it, vi } from "vitest";
import { REQUIRED_WEBGL_EXTENSIONS, pickRenderer } from "./renderer";

function fakeCanvas(exts: string[] | null, { lost = false } = {}) {
  const loseContext = vi.fn();
  const gl = {
    isContextLost: () => lost,
    getSupportedExtensions: () => exts,
    getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null),
  };
  return { canvas: { getContext: (id: string) => (id === "webgl" ? gl : null) }, loseContext };
}

describe("pickRenderer", () => {
  it("garde WebGL quand toutes les extensions sont là", () => {
    const { canvas, loseContext } = fakeCanvas([...REQUIRED_WEBGL_EXTENSIONS, "OES_standard_derivatives"]);
    expect(pickRenderer(() => canvas)).toBe("webgl");
    expect(loseContext).toHaveBeenCalled();
  });

  it("passe en Canvas sans ANGLE_instanced_arrays (Brave sous Linux)", () => {
    const { canvas, loseContext } = fakeCanvas(["OES_vertex_array_object"]);
    expect(pickRenderer(() => canvas)).toBe("canvas");
    expect(loseContext).toHaveBeenCalled();
  });

  it("passe en Canvas sans OES_vertex_array_object", () => {
    expect(pickRenderer(() => fakeCanvas(["ANGLE_instanced_arrays"]).canvas)).toBe("canvas");
  });

  it("passe en Canvas sans WebGL, contexte perdu ou liste d'extensions absente", () => {
    expect(pickRenderer(() => ({ getContext: () => null }))).toBe("canvas");
    expect(pickRenderer(() => fakeCanvas([...REQUIRED_WEBGL_EXTENSIONS], { lost: true }).canvas)).toBe("canvas");
    expect(pickRenderer(() => fakeCanvas(null).canvas)).toBe("canvas");
  });

  it("passe en Canvas si la sonde lève une erreur", () => {
    expect(
      pickRenderer(() => {
        throw new Error("blocked");
      }),
    ).toBe("canvas");
  });
});
