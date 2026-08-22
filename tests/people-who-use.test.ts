import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../app/(marketing)/page.tsx", import.meta.url),
  "utf8",
);
const peopleSection = page.slice(
  page.indexOf("function PeopleWhoUse"),
  page.indexOf("/* ─── Faça as contas"),
);
const attributionManifest = readFileSync(
  new URL("../public/people-who-use/ATTRIBUTIONS.md", import.meta.url),
  "utf8",
);

describe("Pessoas que usam", () => {
  it("renders immediately after Results with the existing marquee people", () => {
    expect(page).toContain(
      "import SphereImageGrid, { type ImageData } from '@/components/ui/img-sphere';",
    );
    expect(page).toContain(
      "const PEOPLE_SPHERE_IMAGES: ImageData[] = PEOPLE_SPHERE_REAL_IMAGES;",
    );
    expect(page).toContain("...MARQUEE_ITEMS.map");
    expect(page).toContain("images={PEOPLE_SPHERE_IMAGES}");
    expect(page).toContain("const PEOPLE_SPHERE_SLOT_COUNT = 60;");
    expect(page).not.toContain("isPlaceholder: true");
    expect(page).not.toContain("people-who-use-placeholder");
    expect(page).toContain("max-w-7xl");
    expect(page).toContain("md:grid-cols-[minmax(0,1fr)_minmax(0,720px)]");
    expect(page).toContain("text-center md:text-left");
    expect(page).toContain("containerSize={720}");
    expect(page).toContain("sphereRadius={250}");
    expect(page).toContain("responsive");
    expect(peopleSection).not.toContain("overflow-x-auto");
    expect(peopleSection).toContain("overflow-hidden");
    expect(page).toContain("Pessoas que");
    expect(page).toContain("bg-gradient-to-r from-[#E4572E] to-[#FFA0DE]");
    expect(page).toContain(">usam</span>");

    expect(page.indexOf("<Results />")).toBeLessThan(
      page.indexOf("<PeopleWhoUse />"),
    );
    expect(page.indexOf("<PeopleWhoUse />")).toBeLessThan(
      page.indexOf("<DoTheMath />"),
    );

    for (let index = 1; index <= 11; index += 1) {
      expect(page).toContain(`/clientes/cliente-${String(index).padStart(2, "0")}.webp`);
    }
    expect(page).toContain("alt: `Cliente ${item.handle}`");
    expect(page).toContain("aria-labelledby=\"people-who-use-title\"");
  });

  it("uses 60 real, optimized assets without changing the marquee contracts", () => {
    expect(page).toContain("const PEOPLE_SPHERE_ADDITIONAL_IMAGES: ImageData[] = [");
    expect(page).toContain("...PEOPLE_SPHERE_ADDITIONAL_IMAGES,");
    expect(page).toContain("...MARQUEE_ITEMS.map");
    expect(page).toContain("alt: 'Pessoa usuária do Creatools'");
    expect(page).not.toContain("containerSize={600}");
    expect(page).not.toContain("sphereRadius={190}");
    expect(page).toContain("baseImageScale={0.22}");
    expect(page).toContain("Array.from({ length: 27 }");
    expect(page).toContain("Array.from({ length: 16 }");
    expect(page).toContain("src: `/people-who-use/portrait-${portraitNumber}.webp`");
    expect(page).toContain("src: `/people-who-use/external-${externalNumber}.webp`");
    expect(page).not.toContain("PEOPLE_SPHERE_REAL_IMAGES[index]");

    for (let index = 1; index <= 33; index += 1) {
      const filename = `portrait-${String(index).padStart(2, "0")}.webp`;
      const fileUrl = new URL(`../public/people-who-use/${filename}`, import.meta.url);
      expect(existsSync(fileUrl)).toBe(true);
      expect(statSync(fileUrl).size).toBeGreaterThan(0);
    }

    for (let index = 1; index <= 16; index += 1) {
      const filename = `external-${String(index).padStart(2, "0")}.webp`;
      const fileUrl = new URL(`../public/people-who-use/${filename}`, import.meta.url);
      expect(existsSync(fileUrl)).toBe(true);
      expect(statSync(fileUrl).size).toBeGreaterThan(0);
    }

    const optimizedAssets = [
      ...Array.from({ length: 33 }, (_, index) =>
        new URL(
          `../public/people-who-use/portrait-${String(index + 1).padStart(2, "0")}.webp`,
          import.meta.url,
        ),
      ),
      ...Array.from({ length: 16 }, (_, index) =>
        new URL(
          `../public/people-who-use/external-${String(index + 1).padStart(2, "0")}.webp`,
          import.meta.url,
        ),
      ),
    ];
    expect(optimizedAssets).toHaveLength(49);
    expect(optimizedAssets.reduce((total, fileUrl) => total + statSync(fileUrl).size, 0)).toBeLessThan(2_000_000);
    expect(attributionManifest.match(/\| `external-\d+\.webp`/g)).toHaveLength(16);
    expect(attributionManifest.match(/\| .* \| .* \| CC0 \|/g)).toHaveLength(16);
  });
});
