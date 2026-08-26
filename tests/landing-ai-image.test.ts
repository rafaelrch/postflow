import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../app/(marketing)/page.tsx", import.meta.url),
  "utf8",
);

describe("landing — card de imagens geradas por IA", () => {
  it("usa o asset local fornecido dentro da moldura 4:5 existente", () => {
    const assetPath = new URL("../public/landing/ai-images-card.webp", import.meta.url);
    const asset = readFileSync(assetPath);
    const mock = page.slice(page.indexOf("function MockAiImages()"), page.indexOf("/** Cantos de mira"));

    expect(statSync(assetPath).size).toBeGreaterThan(0);
    expect(asset.subarray(0, 4).toString()).toBe("RIFF");
    expect(asset.subarray(8, 12).toString()).toBe("WEBP");
    expect(mock).toContain('src="/landing/ai-images-card.webp"');
    expect(mock).toContain('className="object-cover"');
    expect(mock).toContain('className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-[#1a1a1a]"');
    expect(mock).not.toContain("conic-gradient");
  });
});
