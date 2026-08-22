import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

describe("3d parallax unfurling gallery", () => {
  it("renders immediately after the three-step section on the landing page", () => {
    const page = read("app/(marketing)/page.tsx");

    expect(page).toContain(
      "import ParallaxGallery from '@/components/ui/3d-parallax-unfurling-gallery';",
    );
    expect(page).toContain("<ParallaxGallery />");
    expect(page.indexOf("<HowItWorks />")).toBeLessThan(
      page.indexOf("<ParallaxGallery />"),
    );
    expect(page.indexOf("<ParallaxGallery />")).toBeLessThan(
      page.indexOf("<Features />"),
    );
  });

  it("uses the landing page scroll without an internal scroll container", () => {
    const component = read("components/ui/3d-parallax-unfurling-gallery.tsx");

    expect(component).toContain('"use client"');
    expect(component).toContain(
      'const { scrollYProgress } = useScroll({\n    target: containerRef,\n    offset: ["start start", "end end"],\n  });',
    );
    expect(component).not.toContain("container: scrollWrapperRef");
    expect(component).not.toContain("scrollWrapperRef");
    expect(component).toContain('className="w-full overflow-x-clip bg-white"');
    expect(component).toContain("h-[600vh]");
    expect(component).toContain("sticky top-0");
    expect(component).toContain("transformStyle: \"preserve-3d\"");
    expect(component).toContain('bg-white');
    expect(component).not.toContain('bg-[#050505]');
  });

  it("places accessible section copy before the parallax gallery with compact spacing", () => {
    const component = read("components/ui/3d-parallax-unfurling-gallery.tsx");
    const copyPosition = component.indexOf("IA TREINADA PARA CHAMAR ATENÇÃO");
    const galleryPosition = component.indexOf('className="sticky top-0');

    expect(component).toContain('aria-labelledby="parallax-gallery-title"');
    expect(component).toContain('id="parallax-gallery-title"');
    expect(component).toContain("IA TREINADA PARA CHAMAR ATENÇÃO");
    expect(component).toContain("Imagens criadas para");
    expect(component).toContain("parar o scroll");
    expect(component).toContain(
      "Transforme suas ideias em visuais marcantes que dão mais presença ao seu conteúdo no feed.",
    );
    expect(component).not.toContain("Você não precisa de prompts enormes.");
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain(
      "bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent",
    );
    expect(component).toContain(
      'px-6 pb-4 pt-20 text-center md:pb-8 md:pt-28',
    );
    expect(component).toContain(
      "font-display text-5xl font-bold tracking-tight text-black sm:text-6xl md:text-7xl",
    );
    expect(component).toContain(
      'className="sticky top-0 flex h-screen w-full items-start justify-center overflow-hidden pt-4 md:pt-8"',
    );
    expect(copyPosition).toBeGreaterThan(-1);
    expect(copyPosition).toBeLessThan(galleryPosition);
  });

  it("starts the 3D matrix at the useful scroll start and ends front-facing", () => {
    const component = read("components/ui/3d-parallax-unfurling-gallery.tsx");

    expect(component).toContain(
      "const rotateY = useTransform(smoothProgress, [0, 1], [-24, 0]);",
    );
    expect(component).toContain(
      "const rotateX = useTransform(smoothProgress, [0, 1], [12, 0]);",
    );
    expect(component).toContain(
      "const rotateZ = useTransform(smoothProgress, [0, 1], [6, 0]);",
    );
    expect(component).toContain(
      "const translateZ = useTransform(smoothProgress, [0, 1], [-380, 0]);",
    );
    expect(component).toContain(
      'const yCol1 = useTransform(smoothProgress, [0.15, 1], ["0%", "-40%"]);',
    );
    expect(component).toContain(
      'const yCol4 = useTransform(smoothProgress, [0.15, 1], ["-30%", "20%"]);',
    );
  });

  it("uses a closer, flatter camera and larger landscape columns", () => {
    const component = read("components/ui/3d-parallax-unfurling-gallery.tsx");

    expect(component).toContain('style={{ perspective: "1600px" }}');
    expect(component).toContain("w-[28vw] min-w-[200px]");
    expect(component).toContain("aspect-[16/10]");
  });

  it("uses landscape cards and landscape image crops", () => {
    const component = read("components/ui/3d-parallax-unfurling-gallery.tsx");

    expect(component).toContain("aspect-[16/10]");
    expect(component).toContain("w=1200");
    expect(component).toContain("h=750");
    expect(component).toContain("object-cover");
    expect(component).not.toContain("h-[200px] sm:h-[300px] md:h-[400px]");
  });
});
