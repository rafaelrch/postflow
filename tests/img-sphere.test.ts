import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentPath = new URL(
  "../components/ui/img-sphere.tsx",
  import.meta.url,
);

describe("SphereImageGrid", () => {
  it("is a client component with the documented public API", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("'use client';");
    expect(source).toContain("export interface ImageData");
    expect(source).toContain("export interface SphereImageGridProps");
    expect(source).toContain("export default SphereImageGrid;");
    expect(source).toContain("prefers-reduced-motion");
  });

  it("keeps depth fade, hover, drag, rotation, and responsive motion behavior without click popups", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("const [hoveredIndex, setHoveredIndex]");
    expect(source).toContain("const fadeZoneStart = -10");
    expect(source).toContain("const fadeZoneEnd = -30");
    expect(source).toContain("const isVisible = worldPos.z > fadeZoneEnd");
    expect(source).toContain("onMouseEnter");
    expect(source).toContain("onMouseLeave");
    expect(source).toContain("className=\"h-full w-full rounded-full bg-black\"");
    expect(source).toContain("handleMouseDown");
    expect(source).toContain("onMouseDown={handleMouseDown}");
    expect(source).toContain("autoRotate");
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("responsive?: boolean;");
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("typeof ResizeObserver === 'undefined'");
    expect(source).toContain("responsiveSize");
    expect(source).toContain("renderedContainerSize * 0.5 - baseImageSize * 0.6");
    expect(source).toContain("loading={index < 3 ? 'eager' : 'lazy'}");
    expect(source).not.toContain("onClick");
    expect(source).not.toContain("selectedImage");
    expect(source).not.toContain("setSelectedImage");
    expect(source).not.toContain("renderSpotlightModal");
    expect(source).not.toContain("lucide-react");
  });
});
