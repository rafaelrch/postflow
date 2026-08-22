import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../app/(marketing)/page.tsx", import.meta.url),
  "utf8",
);

const sectionHeading = (section: string, nextSection: string) => {
  const source = sectionSource(section, nextSection);
  return source.match(/<h2\b[\s\S]*?<\/h2>/)?.[0] ?? "";
};

const sectionSource = (section: string, nextSection: string) => {
  const start = page.indexOf(`function ${section}()`);
  const end = page.indexOf(`function ${nextSection}()`, start);
  return page.slice(start, end === -1 ? undefined : end);
};

describe("landing section heading visual contracts", () => {
  it("uses the gallery heading scale and treatment on the approved section headings", () => {
    const sections = [
      ["HowItWorks", "Features"],
      ["Features", "Marquee"],
      ["Results", "DoTheMath"],
      ["DoTheMath", "Pricing"],
      ["Pricing", "Faq"],
      ["Faq", "FinalCTA"],
      ["FinalCTA", "Footer"],
    ] as const;
    const sharedHeadingClasses = "font-display text-4xl font-bold tracking-tighter";

    for (const [section, nextSection] of sections) {
      const heading = sectionHeading(section, nextSection);

      expect(heading, `${section} must expose an h2`).not.toBe("");
      expect(heading, `${section} heading visual classes`).toContain(
        sharedHeadingClasses,
      );
      expect(heading, `${section} heading responsive scale`).toContain(
        "sm:text-5xl md:text-6xl",
      );
      expect(heading, `${section} heading alignment`).toContain("text-center");
      expect(heading, `${section} heading alignment container`).toContain(
        "mx-auto",
      );
      expect(heading, `${section} keeps the style in classes`).not.toContain(
        "style={{ fontSize:",
      );
      expect(heading, `${section} no longer uses the old heading treatment`).not.toContain(
        "lp-h tracking-tighter",
      );
    }
  });

  it("preserves the approved section copy and existing emphasis spans", () => {
    expect(page).toContain("Tão simples que parece");
    expect(page).toContain("mágica");
    expect(page).toContain("Tudo que você precisa pra");
    expect(page).toContain("crescer no Instagram");
    expect(page).toContain("Veja o tipo de post que você vai");
    expect(page).toContain("criar com o Creatools");
    expect(page).toContain("Quanto você pagaria");
    expect(page).toContain("separado");
    expect(page).toContain("por tudo isso?");
    expect(page).toContain("Escolha a melhor opção");
    expect(page).toContain("para começar");
    expect(page).toContain("Perguntas");
    expect(page).toContain("frequentes");
    expect(page).toContain("Comece a publicar com");
    expect(page).toContain("consistência de verdade");
  });

  it("applies the approved heading typography and gradient to Hero and Truth", () => {
    const heroStart = page.indexOf("function Hero()");
    const truthStart = page.indexOf("function Truth()");
    const howItWorksStart = page.indexOf("function HowItWorks()");
    const hero = page.slice(heroStart, truthStart);
    const truth = page.slice(truthStart, howItWorksStart);
    const gradient =
      "bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent";
    const heroHeadingTypography =
      "font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl";
    const truthHeadingTypography =
      "font-display text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl";

    expect(hero).toContain(`className="${heroHeadingTypography}"`);
    expect(truth).toContain(`className="mt-6 ${truthHeadingTypography}"`);
    expect(hero).toContain("<BlurReveal as=\"span\" style={{ color: 'var(--lp-black)' }}>");
    expect(hero).not.toContain("<BlurReveal as=\"span\" style={{ color: 'var(--lp-gray)' }}>");
    expect(hero).toContain("pronto em minutos, não em horas.");
    expect(hero).toContain(gradient);
    expect(hero).toContain("lp-hero-gradient");
    expect(page).toContain(
      '.lp-hero-gradient > span[aria-hidden="true"] > span',
    );
    expect(page).toContain(
      "--lp-hero-gradient: linear-gradient(to right, #E4572E, #FFA0DE);",
    );
    expect(page).toContain("background-image: var(--lp-hero-gradient);");
    expect(page).toContain("background-attachment: fixed;");
    expect(page).toContain("background-size: 100vw 100vh;");
    expect(page).not.toContain("background-image: inherit;");
    expect(truth).toContain(
      `<span className="${gradient}">brutal</span>`,
    );
    expect(truth).toContain("<br className=\"hidden md:block\" />");
    expect(truth).toContain("sobre o Instagram em 2026");
  });

  it("keeps Results and DoTheMath in two desktop lines with gradient emphasis", () => {
    const results = sectionHeading("Results", "DoTheMath");
    const doTheMath = sectionHeading("DoTheMath", "Pricing");
    const gradient =
      "bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent";

    for (const heading of [results, doTheMath]) {
      expect(heading).toContain("tracking-tighter");
      expect(heading).toContain("md:whitespace-nowrap");
      expect(heading).toContain(gradient);
      expect(heading).toContain("<br />");
    }

    expect(results).toContain("Veja o tipo de post que você vai");
    expect(results).toContain("criar com o Creatools");
    expect(doTheMath).toContain("Quanto você pagaria");
    expect(doTheMath).toContain("separado");
    expect(doTheMath).toContain("por tudo isso?");
  });

  it("uses the gallery gradient on every existing highlighted section span", () => {
    const gradient =
      "bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent";

    for (const [section, nextSection] of [
      ["Features", "Marquee"],
      ["Results", "DoTheMath"],
      ["DoTheMath", "Pricing"],
      ["Pricing", "Faq"],
      ["Faq", "FinalCTA"],
      ["FinalCTA", "Footer"],
    ] as const) {
      const heading = sectionHeading(section, nextSection);
      expect(heading, `${section} highlighted span`).toContain(gradient);
      expect(heading, `${section} highlighted span no inline gray`).not.toContain(
        "style={{ color:",
      );
    }

    const howItWorks = sectionHeading("HowItWorks", "Features");
    expect(howItWorks).toContain("mágica");
    expect(howItWorks).toContain(gradient);
  });

  it("keeps Pricing title, description, and cards visually separated", () => {
    const pricing = sectionSource("Pricing", "Faq");

    expect(pricing).toContain(
      '<section id="planos" className="py-16 md:py-24 px-6 bg-white">',
    );
    expect(pricing).toContain('className="mt-4 text-[15px]"');
    expect(pricing).toContain(
      'className="mt-8 grid md:grid-cols-2 gap-5 max-w-3xl mx-auto items-start"',
    );
  });

  it("does not extend the heading treatment to internal cards or the footer", () => {
    const howItWorks = sectionSource("HowItWorks", "Features");
    const features = sectionSource("Features", "Marquee");
    const footerStart = page.indexOf("function Footer()");
    const footer = page.slice(footerStart);

    expect(howItWorks).toContain(
      '<h3 className="text-[20px] font-bold tracking-tight">',
    );
    expect(features).toContain('<h3 className="lp-h mt-6"');
    expect(footer).not.toContain("font-display text-5xl font-bold tracking-tight");
  });
});
