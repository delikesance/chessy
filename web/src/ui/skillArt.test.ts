import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog";
import { RULES } from "../screens/collectionData";
import { SkillSprite } from "./SkillArt";

describe("skill illustrations and rules", () => {
  it("has one sprite symbol and one rules text per catalog skill, under the server id", () => {
    const sprite = renderToStaticMarkup(createElement(SkillSprite));
    for (const { id } of CATALOG) {
      expect(sprite, `symbol sk-${id}`).toContain(`id="sk-${id}"`);
      expect(RULES[id], `rules for ${id}`).toBeTruthy();
    }
  });
});
