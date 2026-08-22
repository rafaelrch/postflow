"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";

const HORIZONTAL_IMAGES = [
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&h=750&q=85",
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&h=750&q=85",
];

interface ImageCardProps {
  src: string;
  onLoad?: () => void;
}

function ImageCard({ src, onLoad }: ImageCardProps) {
  return (
    <div className="relative aspect-[16/10] w-full shrink-0 cursor-pointer overflow-hidden bg-neutral-100 transition-transform duration-300 hover:scale-[1.02] [backface-visibility:hidden] [transform-style:preserve-3d]">
      <img
        src={src}
        alt="Gallery asset"
        loading="lazy"
        decoding="async"
        onLoad={onLoad}
        className="h-full w-full object-cover opacity-80 transition-opacity duration-300 hover:opacity-100"
      />
    </div>
  );
}

export default function Component() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const loadedCountRef = useRef(0);

  const handleItemLoad = useCallback(() => {
    loadedCountRef.current += 1;
    if (!isReady && loadedCountRef.current >= 1) setIsReady(true);
  }, [isReady]);

  useEffect(() => {
    const timeout = setTimeout(() => setIsReady(true), 1200);
    return () => clearTimeout(timeout);
  }, []);

  const colMedia = useMemo(() => {
    const col1Base = HORIZONTAL_IMAGES.filter((_, index) => index % 4 === 0);
    const col2Base = HORIZONTAL_IMAGES.filter((_, index) => index % 4 === 1);
    const col3Base = HORIZONTAL_IMAGES.filter((_, index) => index % 4 === 2);
    const col4Base = HORIZONTAL_IMAGES.filter((_, index) => index % 4 === 3);

    return {
      col1: [...col1Base, ...col1Base],
      col2: [...col2Base, ...col2Base],
      col3: [...col3Base, ...col3Base],
      col4: [...col4Base, ...col4Base],
    };
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 20,
    mass: 0.5,
  });

  const bannerWidth = useTransform(smoothProgress, [0, 0.15], ["90vw", "100vw"]);
  const bannerHeight = useTransform(smoothProgress, [0, 0.15], ["80vh", "100vh"]);
  const bannerRadius = useTransform(smoothProgress, [0, 0.15], ["48px", "0px"]);
  const bannerBorderWidth = useTransform(smoothProgress, [0, 0.15], ["4px", "0px"]);

  const rotateY = useTransform(smoothProgress, [0, 1], [-24, 0]);
  const rotateX = useTransform(smoothProgress, [0, 1], [12, 0]);
  const rotateZ = useTransform(smoothProgress, [0, 1], [6, 0]);
  const translateZ = useTransform(smoothProgress, [0, 1], [-380, 0]);

  const yCol1 = useTransform(smoothProgress, [0.15, 1], ["0%", "-40%"]);
  const yCol2 = useTransform(smoothProgress, [0.15, 1], ["-40%", "10%"]);
  const yCol3 = useTransform(smoothProgress, [0.15, 1], ["0%", "-40%"]);
  const yCol4 = useTransform(smoothProgress, [0.15, 1], ["-30%", "20%"]);

  return (
    <div
      className="w-full overflow-x-clip bg-white"
      data-ready={isReady}
    >
      <section
        ref={containerRef}
        aria-labelledby="parallax-gallery-title"
        className="relative h-[600vh] w-full bg-white font-sans text-black selection:bg-black selection:text-white"
      >
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pb-4 pt-20 text-center md:pb-8 md:pt-28">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[var(--lp-gray)]">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            IA TREINADA PARA CHAMAR ATENÇÃO
          </p>
          <h2
            id="parallax-gallery-title"
            className="mt-5 max-w-3xl font-display text-5xl font-bold tracking-tight text-black sm:text-6xl md:text-7xl"
          >
            Imagens criadas para{" "}
            <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">
              parar o scroll
            </span>
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--ink-dim)] md:text-lg">
            Transforme suas ideias em visuais marcantes que dão mais presença ao seu conteúdo no feed.
          </p>
        </div>

        <div className="sticky top-0 flex h-screen w-full items-start justify-center overflow-hidden pt-4 md:pt-8">
          <motion.div
            style={{
              width: bannerWidth,
              height: bannerHeight,
              borderRadius: bannerRadius,
              borderWidth: bannerBorderWidth,
              borderColor: "#e5e5e5",
            }}
            className="relative mx-auto flex max-w-[1920px] items-center justify-center overflow-hidden bg-white [backface-visibility:hidden] [transform-style:preserve-3d]"
          >
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ perspective: "1600px" }}
            >
              <div className="absolute inset-0 z-20 shadow-[inset_0_100px_150px_-50px_rgba(255,255,255,1),inset_0_-100px_150px_-50px_rgba(255,255,255,1)]" />
              <div className="absolute inset-0 z-20 shadow-[inset_150px_0_150px_-50px_rgba(255,255,255,1),inset_-150px_0_150px_-50px_rgba(255,255,255,1)]" />

              <motion.div
                style={{
                  rotateX,
                  rotateY,
                  rotateZ,
                  z: translateZ,
                  transformStyle: "preserve-3d",
                }}
                className="flex h-[150vh] w-[120vw] origin-center items-center justify-center gap-4 opacity-100 [backface-visibility:hidden] [transform-style:preserve-3d] md:gap-6"
              >
                <motion.div style={{ y: yCol1 }} className="pointer-events-auto flex w-[28vw] min-w-[200px] flex-col gap-4 md:gap-6">
                  {colMedia.col1.map((src, index) => (
                    <ImageCard key={`col1-${index}`} src={src} onLoad={handleItemLoad} />
                  ))}
                </motion.div>

                <motion.div style={{ y: yCol2 }} className="pointer-events-auto flex w-[28vw] min-w-[200px] flex-col gap-4 md:gap-6">
                  {colMedia.col2.map((src, index) => (
                    <ImageCard key={`col2-${index}`} src={src} onLoad={handleItemLoad} />
                  ))}
                </motion.div>

                <motion.div style={{ y: yCol3 }} className="pointer-events-auto flex w-[28vw] min-w-[200px] flex-col gap-4 md:gap-6">
                  {colMedia.col3.map((src, index) => (
                    <ImageCard key={`col3-${index}`} src={src} onLoad={handleItemLoad} />
                  ))}
                </motion.div>

                <motion.div style={{ y: yCol4 }} className="pointer-events-auto flex w-[28vw] min-w-[200px] flex-col gap-4 md:gap-6">
                  {colMedia.col4.map((src, index) => (
                    <ImageCard key={`col4-${index}`} src={src} onLoad={handleItemLoad} />
                  ))}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
