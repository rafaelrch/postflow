// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ shouldReduce: false }));

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>(
    "motion/react",
  );

  return { ...actual, useReducedMotion: () => motionState.shouldReduce };
});

import BlurReveal from "@/components/ui/blur-reveal";

const marketingPage = readFileSync(
  resolve(process.cwd(), "app/(marketing)/page.tsx"),
  "utf8",
);

afterEach(() => {
  cleanup();
});

describe("BlurReveal", () => {
  it("is used by both preserved hero title lines", () => {
    expect(marketingPage).toContain(
      "import { BlurReveal } from '@/components/ui/blur-reveal';",
    );
    expect(marketingPage).toContain(
      '<BlurReveal as="span" style={{ color: \'var(--lp-black)\' }}>',
    );
    expect(marketingPage).toContain(
      '<BlurReveal\n            as="span"\n            className="lp-hero-gradient bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent"\n          >',
    );
    expect(marketingPage).toContain("pronto em minutos, não em horas.");
  });

  it("renders the accessible text with the requested semantic element", () => {
    render(
      <BlurReveal as="h2" className="hero-title">
        You can just ship things.
      </BlurReveal>,
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "You can just ship things.",
      }),
    ).toBeTruthy();
  });

  it("renders the final state without blur, y movement, or stagger in reduced motion", () => {
    motionState.shouldReduce = true;

    try {
      const { container } = render(<BlurReveal>Reduced motion</BlurReveal>);

      expect(container.querySelectorAll('[style*="filter"]').length).toBe(0);
      expect(container.querySelectorAll('[style*="transform"]').length).toBe(0);
    } finally {
      motionState.shouldReduce = false;
    }
  });

  it("splits each word into individually animated characters", () => {
    const { container } = render(
      <BlurReveal letterSpacing="0.02em">Blur reveal</BlurReveal>,
    );

    const animatedCharacters = container.querySelectorAll(
      '[style*="margin-right"]',
    );

    expect(animatedCharacters).toHaveLength("Blur reveal".replace(/ /g, "").length);
    expect(animatedCharacters[0]?.getAttribute("style")).toContain(
      "margin-right: 0.02em",
    );
  });
});
