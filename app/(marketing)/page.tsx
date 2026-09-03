'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ShootingStarsGrid } from '@/components/ui/shooting-stars-grid';
import { ImageStreamHero } from '@/components/ui/image-stream-hero';
import { BlurReveal } from '@/components/ui/blur-reveal';
import ParallaxGallery from '@/components/ui/3d-parallax-unfurling-gallery';
import SphereImageGrid, { type ImageData } from '@/components/ui/img-sphere';
import LeadCaptureModal from '@/components/billing/LeadCaptureModal';
import { SUPORTE_WHATSAPP_LABEL, SUPORTE_WHATSAPP_URL } from '@/lib/suporte';
import { ChevronRight, Plus, X, Menu, Heart, MessageCircle, Repeat2, Check } from 'lucide-react';

/* ────────────────────────────────────────────────────────────────
   CREATOOLS · LANDING PAGE
   Visual: Figma "LANDING PAGE - CREATOOLS" — branco/preto, pills,
   sombra offset nos CTAs, seções dark de contraste.
   Copy: COPY - CREATOOLS.md
   ──────────────────────────────────────────────────────────────── */

/**
 * Canais oficiais de atendimento. O suporte é por WHATSAPP (decisão do Rafael,
 * 02/09/2026 — substitui o e-mail, que era o canal desde 30/07/2026); o
 * Instagram continua como alternativa.
 *
 * O número do WhatsApp NÃO mora aqui: vem de `lib/suporte.ts`, fonte única.
 * Foi a duplicação deste bloco pelas 5 páginas públicas que deixou um endereço
 * de e-mail errado espalhado sem ninguém notar.
 */
// Frase que manda a pessoa agir precisa dizer ONDE.
const SUPORTE_URL = 'https://instagram.com/creatools';
const SUPORTE_HANDLE = '@creatools';

/**
 * Os DOIS canais oficiais, sempre juntos. WhatsApp primeiro: é o canal que o
 * Rafael atende. O DM do Instagram continua oferecido, nunca como via única.
 */
function Canais() {
  return (
    <>
      <a
        href={SUPORTE_WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {SUPORTE_WHATSAPP_LABEL}
      </a>{' '}
      ou no Instagram{' '}
      <a
        href={SUPORTE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {SUPORTE_HANDLE}
      </a>
    </>
  );
}

const LP_CSS = `
  html:has(.lp) { scroll-behavior: smooth; }
  .lp {
    --lp-black: #0A0A0A;
    --lp-gray: #9A9A96;
    --lp-gray-2: #6E6E6A;
    --lp-band: #F6F6F5;
    --lp-line: #E8E8E6;
    font-family: var(--font-inter-display), 'Inter Display', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    background: #fff;
    color: var(--lp-black);
    letter-spacing: -0.01em;
  }
  .lp ::selection { background: var(--lp-black); color: #fff; }
   .lp-h { font-weight: 700; line-height: 1.04; }
   .lp-hero-gradient {
     --lp-hero-gradient: linear-gradient(to right, #E4572E, #FFA0DE);
   }
   .lp-hero-gradient > span[aria-hidden="true"] > span {
     color: transparent;
     background-image: var(--lp-hero-gradient);
     background-attachment: fixed;
     background-size: 100vw 100vh;
     background-position: 0 0;
     background-repeat: no-repeat;
     -webkit-background-clip: text;
     background-clip: text;
   }
  .lp-badge {
    display: inline-flex; align-items: center;
    font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 9px 18px; border-radius: 999px;
  }
  .lp-badge.outline { border: 1px solid var(--lp-line); background: #fff; color: var(--lp-black); }
  .lp-badge.soft { background: #EFEFED; color: var(--lp-black); }
  .lp-badge.on-dark { border: 1px solid rgba(255,255,255,0.25); color: #fff; background: transparent; }

  .lp-btn {
    display: inline-flex; align-items: center; gap: 12px;
    font-size: 15px; font-weight: 600; line-height: 1;
    border-radius: 15px; white-space: nowrap;
    transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
  }
  .lp-btn.black {
    background: var(--lp-black); color: #fff;
    padding: 9px 9px 9px 24px;
    box-shadow: 0 0 0 2px #fff, 6px 6px 0 0 var(--lp-black);
  }
  .lp-btn.black:hover { transform: translate(2px, 2px); box-shadow: 0 0 0 2px #fff, 3px 3px 0 0 var(--lp-black); }
  .lp-btn.black:active { transform: translate(5px, 5px); box-shadow: 0 0 0 2px #fff, 0 0 0 0 var(--lp-black); }
  .lp-btn.black.flat { border-radius: 999px; box-shadow: none; }
  .lp-btn.black.flat:hover { transform: none; box-shadow: none; }
  .lp-btn.black.flat:active { transform: none; box-shadow: none; }
  .lp-btn.light { background: #F2F2F0; color: var(--lp-black); padding: 17px 26px; }
  .lp-btn.light:hover { background: #EAEAE8; }
  .lp-btn.white {
    background: #fff; color: var(--lp-black);
    padding: 9px 9px 9px 24px;
    border: 1px solid var(--lp-line);
  }
  .lp-btn.white:hover { transform: translateY(-1px); }
  .lp-btn:disabled { opacity: 0.55; pointer-events: none; }

  /* Navbar sobre o hero: o papel translúcido cria uma superfície legível sem
     virar uma faixa sólida diante do primeiro mockup. Os tokens do componente
     shadcn são papel/linha/tinta/acento nesta landing. */
  .lp-nav-shell {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    width: 100%;
    padding: 10px 12px 10px 16px;
    border: 1px solid color-mix(in srgb, var(--line) 92%, var(--ink) 8%);
    border-radius: 999px;
    background: color-mix(in srgb, var(--paper) 86%, transparent);
    color: var(--ink);
    backdrop-filter: blur(10px) saturate(1.08);
    -webkit-backdrop-filter: blur(10px) saturate(1.08);
    box-shadow: 0 16px 32px -22px rgba(10, 10, 10, 0.28);
    transition: border-radius 220ms var(--ease), background 220ms var(--ease);
  }
  .lp-nav-shell.is-open { border-radius: 20px; }
  .lp-nav-shell .lp-btn { border-radius: 999px; }
  .lp-nav-shell .lp-btn.black { border: 0; box-shadow: none; }
  .lp-nav-shell .lp-btn.black:hover { transform: translateY(-1px); }
  .lp-nav-shell .lp-btn.black:hover,
  .lp-nav-shell .lp-btn.black:active { box-shadow: none; }
  .lp-nav-links { color: var(--ink-dim); }
  .lp-nav-link {
    display: inline-flex; align-items: center; height: 24px; min-height: 24px; max-height: 24px;
    line-height: 24px; min-width: 0;
    transition: color 180ms ease;
  }
  .lp-nav-link:hover, .lp-nav-link:focus-visible { color: var(--accent-ink); }
  .lp-nav-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
  .lp-nav-viewport {
    display: block; flex: 0 0 auto; width: max-content; height: 24px;
    min-height: 24px; max-height: 24px; line-height: 24px; overflow: hidden;
  }
  .lp-nav-label {
    display: flex; flex-direction: column; width: max-content; flex: 0 0 48px; height: 48px;
    min-height: 48px; max-height: 48px; line-height: 24px; overflow: hidden;
    align-items: flex-start;
    transition: transform 220ms var(--ease);
  }
  .lp-nav-link:hover .lp-nav-label, .lp-nav-link:focus-visible .lp-nav-label { transform: translateY(-24px); }
  .lp-nav-label-face {
    display: flex; align-items: center; flex: 0 0 24px; height: 24px;
    min-height: 24px; max-height: 24px; line-height: 24px; white-space: nowrap;
  }
  .lp-nav-login {
    display: none;
    background: color-mix(in srgb, var(--paper) 94%, transparent) !important;
    color: var(--ink) !important;
    border: 1px solid color-mix(in srgb, var(--line) 86%, transparent);
    box-shadow: none;
  }
  .lp-nav-login:hover { background: var(--paper) !important; transform: translateY(-1px); }
  .lp-nav-menu-button {
    display: grid; place-items: center; width: 38px; height: 38px;
    border: 1px solid var(--line);
    border-radius: 999px; color: var(--ink);
    transition: background 180ms ease, color 180ms ease, border-radius 220ms var(--ease);
  }
  .lp-nav-menu-button:hover { background: var(--paper-2); }
  .lp-nav-shell.is-open .lp-nav-menu-button { border-radius: 12px; }
  .lp-nav-mobile-panel {
    display: flex; flex-direction: column; gap: 8px;
    padding: 18px 4px 4px;
    border-top: 1px solid var(--line);
  }
  .lp-nav-mobile-link {
    display: flex; align-items: center; min-height: 42px; padding: 0 12px;
    border-radius: 12px; color: var(--ink-dim);
    transition: background 180ms ease, color 180ms ease;
  }
  .lp-nav-mobile-link:hover, .lp-nav-mobile-link:focus-visible { background: var(--paper-2); color: var(--ink); }
  .lp-nav-mobile-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .lp-nav-mobile .lp-nav-login { display: inline-flex; justify-content: center; width: 100%; }
  @media (min-width: 768px) {
    .lp-nav-menu-button, .lp-nav-mobile-panel { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .lp-nav-shell, .lp-nav-label, .lp-nav-menu-button, .lp-nav-mobile-link { transition: none; }
  }

  /* O grupo de ações desktop some no mobile para a marca caber na barra; os
     mesmos links reaparecem no painel mobile real. O Login fica display:none
     fora do painel, então não deixa um botão invisível recebendo foco.
     A regra mora AQUI, e não numa classe .hidden do Tailwind, porque este
     style é injetado no body, DEPOIS da folha do Tailwind: com a mesma
     especificidade quem vem por último ganha, e o display:inline-flex de
     .lp-btn venceria o .hidden. Na mesma folha a ordem é minha e o resultado é
     determinístico. */
  .lp-nav-login { display: none; }
  @media (min-width: 640px) { .lp-nav-login { display: inline-flex; } }

  /* CTA principal do hero: uma segunda camada BRANCA atrás do botão preto,
     deslocada pra baixo/direita, com borda preta fina e sombra dura (sem blur).
     A camada é decorativa e fica FORA do <a> — o alvo de clique e o foco de
     teclado continuam sendo só o botão. Por isso ela também é pointer-events:
     none: nem rouba clique nas bordas nem gera hover fantasma.
     O botão perde aqui a própria sombra offset preta (.lp-btn.black) porque
     quem faz esse papel agora é o shape; o anel branco de 2px continua, é ele
     que separa o preto do botão da borda preta do shape.

     SÃO DUAS CAMADAS, não três: o botão preto e, atrás, a forma branca
     contornada. O que parece sombra preta na referência é a BORDA do shape.
     O shape já teve um box-shadow preto aqui e ele empilhava uma terceira
     camada 5px além da segunda — era o "aplicou por baixo" em vez de
     substituir. Não devolva essa sombra. */
  .lp-cta-stack { position: relative; display: inline-flex; }
  .lp-cta-stack > .lp-btn { position: relative; z-index: 1; }
  .lp-cta-stack > .lp-btn.black { box-shadow: 0 0 0 2px #fff; }
  .lp-cta-shape {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: #fff;
    border: 2px solid var(--lp-black);
    border-radius: 15px;
    transform: translate(6px, 6px);
  }
  /* O shape fica parado e o botão é que anda: no hover encosta e no :active
     assenta exatamente sobre ele (o translate do :active tem que ser igual ao
     offset do shape — hoje 6px nos dois). */
  .lp-cta-stack > .lp-btn.black:hover { box-shadow: 0 0 0 2px #fff; }
  /* O translate do :active global é 5px (casava com a sombra de 6px do botão
     solto). Aqui ele passa a 6px para assentar exatamente sobre o shape. */
  .lp-cta-stack > .lp-btn.black:active { transform: translate(6px, 6px); box-shadow: 0 0 0 2px #fff; }

  .lp-arrow { width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center; flex-shrink: 0; }
  .lp-arrow.on-black { background: rgba(255,255,255,0.16); color: #fff; }
  .lp-arrow.on-white { background: #EFEFED; color: var(--lp-black); }
  .lp-arrow.solid { background: var(--lp-black); color: #fff; }

  @keyframes lp-marquee {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  .lp-marquee-track { display: flex; width: max-content; animation: lp-marquee 38s linear infinite; }
  .lp-marquee:hover .lp-marquee-track { animation-play-state: paused; }

  /* Aba "Seu rosto no carrossel": a imagem gerada nasce borrada, como se
     estivesse renderizando, e revela nítida. Em loop.

     O desfoque é filter sobre a imagem JA carregada — nada de trocar de arquivo
     no meio, que piscaria e dependeria da rede. E a animacao e CSS, nao
     requestAnimationFrame: rAF congela em documento de segundo plano, foi por
     isso que o cross-fade das abas tambem virou CSS. */
  /* Ciclo de 9s com DOIS patamares longos, nao um pulso: ~3,6s borrada com o
     selo, ~1s de transicao, ~3,7s nitida e sem selo, e o resto voltando.
     O selo comeca a sumir em 40% e ja esta em zero em 50%, ANTES de a imagem
     ficar nitida em 52% — assim ele nunca aparece por cima da imagem pronta.
     As duas keyframes tem que ficar na MESMA duracao, senao elas defasam e o
     selo passa a piscar no meio do patamar nitido. */
  @keyframes lp-render-reveal {
    0%, 40%   { filter: blur(12px) saturate(0.85); transform: scale(1.04); }
    52%, 92%  { filter: blur(0) saturate(1);       transform: scale(1); }
    100%      { filter: blur(12px) saturate(0.85); transform: scale(1.04); }
  }
  @keyframes lp-render-badge {
    0%, 40%  { opacity: 1; }
    50%, 94% { opacity: 0; }
    100%     { opacity: 1; }
  }
  .lp-render-img   { animation: lp-render-reveal 9s ease-in-out infinite; }
  .lp-render-badge { animation: lp-render-badge 9s ease-in-out infinite; }

  /* Quem pediu menos movimento ve o resultado final, parado: imagem nitida e
     sem o selo de "gerando". */
  @media (prefers-reduced-motion: reduce) {
   .lp-render-img   { animation: none; filter: none; transform: none; }
   .lp-render-badge { animation: none; opacity: 0; }
   }

  /* O corredor acompanha a composição do hero: no mobile o eixo sobe para
     que as primeiras cartas apareçam ainda na viewport inicial; no desktop
     conserva respiro entre a linha de apoio e a faixa de imagens. */
  .lp-hero-stream {
    --hero-stream-axis: 10%;
    --hero-stream-card-scale: 1.22;
  }
  @media (min-width: 768px) {
    .lp-hero-stream {
      --hero-stream-axis: 32%;
      --hero-stream-card-scale: 1;
    }
  }
`;

/* ─── Motion helpers ─────────────────────────────────────────── */

function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ArrowChip({ dark = false, solid = false }: { dark?: boolean; solid?: boolean }) {
  const variant = solid ? 'solid' : dark ? 'on-black' : 'on-white';
  return (
    <span className={`lp-arrow ${variant}`}>
      <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
    </span>
  );
}

/* ─── Nav ─────────────────────────────────────────────────────── */

function Nav() {
  const shouldReduceMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const links = [
    { href: '#recursos', label: 'Recursos' },
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#planos', label: 'Planos' },
    { href: '#faq', label: 'FAQ' },
  ];
  return (
    <motion.header
      initial={shouldReduceMotion ? false : { opacity: 0, x: '-50%', y: -16 }}
      animate={{ opacity: 1, x: '-50%', y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-6xl"
    >
      <div className={`lp-nav-shell ${isMenuOpen ? 'is-open' : ''}`}>
        {/* Só a logo, sem o nome escrito ao lado. Com o texto fora, o alt da
            imagem é o ÚNICO nome acessível deste link — sem ele o leitor de tela
            anunciaria "link" e mais nada. Não apague o alt.

            width/height seguem a proporção REAL do arquivo (7644×2144 ≈ 3.57:1).
            Antes eram 30×30: a marca é deitada, então dentro de uma caixa
            quadrada com object-contain ela era "encaixada" e sobrava só 30×8px
            de logo visível — daí a sensação de logo minúscula. A altura é quem
            manda agora (`h-*` + `w-auto`), e os atributos vão no tamanho grande
            para o Next servir arquivo com resolução de sobra em tela retina.

            A altura ainda é responsiva, mas o aperto diminuiu: no mobile as
            ações ficam no painel da navbar. 44px continua só no desktop, onde
            sobra espaço. */}
        <Link href="/" className="flex items-center">
          <Image
            src="/LOGO_SEMFUNDO.png"
            alt="Creatools"
            width={157}
            height={44}
            className="object-contain h-8 w-auto md:h-11"
          />
        </Link>

        <nav className="lp-nav-links hidden md:flex items-center gap-8 text-[14.5px] font-medium">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="lp-nav-link" aria-label={l.label}>
              <span className="lp-nav-viewport" aria-hidden="true">
                <span className="lp-nav-label">
                  <span className="lp-nav-label-face">{l.label}</span>
                  <span className="lp-nav-label-face">{l.label}</span>
                </span>
              </span>
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="lp-btn light lp-nav-login !py-[13px] !px-6 text-[14px]">Login</Link>
          <Link href="/cadastro" className="lp-btn black !text-[14px] !pl-5 !py-[7px]">
            Começar agora <ArrowChip dark />
          </Link>
        </div>

        <button
          type="button"
          className="lp-nav-menu-button md:hidden"
          aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={isMenuOpen}
          aria-controls="lp-mobile-menu"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
        </button>

        <AnimatePresence initial={false}>
          {isMenuOpen && (
            <motion.div
              id="lp-mobile-menu"
              key="lp-mobile-menu"
              initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
              className="lp-nav-mobile-panel lp-nav-mobile md:hidden basis-full"
            >
              {links.map((l) => (
                <a key={l.href} href={l.href} className="lp-nav-mobile-link" onClick={() => setIsMenuOpen(false)}>
                  {l.label}
                </a>
              ))}
              <div className="mt-2 grid gap-2">
                <Link href="/login" className="lp-btn light lp-nav-login !py-[13px] !px-6 text-[14px]" onClick={() => setIsMenuOpen(false)}>
                  Login
                </Link>
                <Link href="/cadastro" className="lp-btn black justify-center !text-[14px] !py-[9px]" onClick={() => setIsMenuOpen(false)}>
                  Começar agora <ArrowChip dark />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}

/* ─── Hero ────────────────────────────────────────────────────── */

const HERO_IMAGES = [1, 3].flatMap((c) =>
  [1, 2, 3, 4, 5].map((s) => ({
    src: `/cards_para_hero/carrossel-${c}/carrossel-${c}---${s}.webp`,
    alt: '',
  })),
);

function HeroCarousel() {
  return (
    <ImageStreamHero
      images={HERO_IMAGES}
      axis="var(--hero-stream-axis)"
      scale="var(--hero-stream-card-scale)"
      className="lp-hero-stream h-[440px] w-full md:h-[560px]"
    />
  );
}

function Hero() {
  return (
    <ShootingStarsGrid
      className="min-h-0 rounded-none border-0 shadow-none !bg-none !bg-white overflow-x-clip overflow-y-visible"
      contentClassName="block min-h-0 px-0 py-0 sm:px-0 pt-32 md:pt-36 pb-6 md:pb-14"
      glow={false}
    >
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl"
        >
          <BlurReveal as="span" style={{ color: 'var(--lp-black)' }}>
            Seu conteúdo do Instagram
          </BlurReveal>
          <br />
          <BlurReveal
            as="span"
            className="lp-hero-gradient bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent"
          >
            pronto em minutos, não em horas.
          </BlurReveal>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
          className="mt-6 text-[17px] md:text-[19px] leading-relaxed max-w-2xl mx-auto"
          style={{ color: 'var(--lp-gray)' }}
        >
          Carrosséis, news cards e agenda num único estúdio de IA. Ela escreve, desenha e organiza. Você só aprova.{' '}
          <b style={{ color: 'var(--lp-black)' }}>Sem Canva. Sem designer. Sem bloqueio criativo.</b>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <span className="lp-cta-stack">
            <span className="lp-cta-shape" aria-hidden="true" />
            <a href="#planos" className="lp-btn black">
              Quero criar meu primeiro carrossel <ArrowChip dark />
            </a>
          </span>
          <a href="#como-funciona" className="lp-btn light">Ver como funciona</a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-6 text-[13.5px]"
          style={{ color: 'var(--lp-gray)' }}
        >
          Acesso imediato · Primeiro post pronto em menos de 5 minutos
        </motion.p>
      </div>

      {/* Mockups */}
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.55 }}
        className="relative mt-0 md:mt-6"
      >
        <HeroCarousel />
      </motion.div>
    </ShootingStarsGrid>
  );
}

/* ─── A verdade brutal ────────────────────────────────────────── */

function Truth() {
  return (
    <section className="py-20 md:py-28 px-6" style={{ background: 'var(--lp-band)' }}>
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        {/* A prova é o print da matéria, sozinho — o card preto com a citação
            saiu daqui. A manchete do print já diz o que a citação dizia, e dois
            blocos empilhados dobravam a altura desta coluna.
            A imagem entra INTEIRA (717×857, o screenshot original sem recorte) e
            sem corte no encaixe: `w-full h-auto` deixa o container assumir a
            proporção dela, então não há `cover` cortando nem faixa vazia de
            `contain`. */}
        <FadeUp>
          <figure>
            {/* Nome novo, e não a substituição do arquivo antigo: o print
                trocou de recorte mantendo o mesmo caminho e o otimizador
                continuou servindo a versão velha do cache (mesma URL, conteúdo
                diferente). Com `h-auto` quem manda na altura é o bitmap
                decodificado, então a imagem antiga ressuscitava o recorte.
                Conteúdo novo, caminho novo. */}
            <Image
              src="/prova-mosseri-smt-full.png"
              alt="Print da matéria do SocialMediaToday com a manchete “Chefe da IG recomenda publicação de carrosséis para melhorar o alcance.”, publicada em 17 de outubro de 2024 por André Hutchinson. A matéria mostra um vídeo de Adam Mosseri, chefe do Instagram, recomendando carrosséis para aumentar o alcance."
              width={717}
              height={857}
              sizes="(max-width: 768px) 100vw, 45vw"
              className="w-full h-auto rounded-[32px]"
              style={{ border: '1px solid var(--lp-line)', background: '#fff' }}
            />
            <figcaption className="mt-4 text-[12.5px]" style={{ color: 'var(--lp-gray-2)' }}>
              SocialMediaToday · 17 de outubro de 2024 · André Hutchinson
            </figcaption>
          </figure>
        </FadeUp>

        <FadeUp delay={0.12}>
          <span className="lp-badge" style={{ background: '#fff', color: 'var(--lp-black)' }}>A verdade que ninguém te conta</span>
          <h2 className="mt-6 font-display text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Aqui está a verdade <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">brutal</span>
            <br className="hidden md:block" /> sobre o Instagram em 2026
          </h2>
          <div className="mt-6 space-y-4 text-[15.5px] leading-relaxed" style={{ color: 'var(--lp-gray-2)' }}>
            <p>
              O próprio <b style={{ color: 'var(--lp-black)' }}>CEO do Instagram</b> já confirmou: o algoritmo entrega carrosséis mais do que qualquer
              outro formato. Quem não posta carrossel com frequência, <b style={{ color: 'var(--lp-black)' }}>simplesmente não aparece</b>.
            </p>
            <p>
              Mas tem uma segunda verdade que quase ninguém fala: <b style={{ color: 'var(--lp-black)' }}>frequência vence perfeição</b>. Enquanto você
              passa 3 horas no Canva polindo um único post, seu concorrente publica o assunto do momento primeiro e leva o alcance que era seu.
            </p>
            <p>
              Quem cresce não é quem posta mais bonito. É quem publica rápido, todo dia, com padrão visual. É exatamente isso que o Creatools coloca na
              sua mão: <b style={{ color: 'var(--lp-black)' }}>velocidade + consistência</b>, sem depender de inspiração.
            </p>
          </div>
          <a href="#planos" className="lp-btn black flat mt-8">
            Quero parar de perder tempo <ArrowChip dark />
          </a>
        </FadeUp>
      </div>
    </section>
  );
}

/* ─── Como funciona ───────────────────────────────────────────── */

const STEPS = [
  {
    title: 'Diga o tema',
    // Os quatro nomes são os do wizard (TEMPLATES em CreateWizard.tsx). O
    // `minimalist` existe no editor mas NÃO é oferecido na criação — não pode
    // aparecer aqui como opção.
    desc: 'Digite uma frase simples, como “5 erros de quem começa a treinar”, e escolha o template: Profile, Atelier, Manifesto ou Radar.',
  },
  {
    title: 'A IA monta tudo',
    desc: 'Texto dos slides, legenda e hashtags, no tom da sua marca. Em segundos o carrossel completo aparece no editor.',
  },
  {
    title: 'Exporte e publique',
    desc: 'Baixe em Full HD (PNG ou ZIP), marque o dia no calendário e publique você mesmo no seu perfil.',
  },
];

function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 md:py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto text-center">
        <FadeUp>
          <span className="lp-badge outline">Em 3 passos</span>
          <h2 className="mt-5 mx-auto text-center font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
            Tão simples que parece <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">mágica</span>
          </h2>
          <p className="mt-4 text-[17px]" style={{ color: 'var(--lp-gray)' }}>3 passos. Poucos minutos. Post pronto pra publicar.</p>
        </FadeUp>

        <div className="relative mt-16">
          <div className="hidden md:block absolute top-7 left-[16%] right-[16%] h-px" style={{ background: 'var(--lp-line)' }} />
          <div className="grid md:grid-cols-3 gap-10 md:gap-8">
            {STEPS.map((s, i) => (
              <FadeUp key={i} delay={i * 0.12}>
                <div className="flex flex-col items-center">
                  <div
                    className="relative z-10 w-14 h-14 rounded-full grid place-items-center text-[20px] font-bold bg-white"
                    style={{ border: '1px solid var(--lp-line)' }}
                  >
                    {i + 1}
                  </div>
                  <div className="hidden md:block w-px h-8" style={{ background: 'var(--lp-line)' }} />
                  <div className="mt-4 md:mt-0 w-full rounded-[24px] p-7" style={{ border: '1px solid var(--lp-line)' }}>
                    <h3 className="text-[20px] font-bold tracking-tight">{s.title}</h3>
                    <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: 'var(--lp-gray)' }}>{s.desc}</p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>

        <FadeUp delay={0.2} className="mt-14">
          <a href="#planos" className="lp-btn black flat">
            Quero criar meu carrossel <ArrowChip dark />
          </a>
        </FadeUp>
      </div>
    </section>
  );
}

/* ─── Recursos (tabs) ─────────────────────────────────────────── */

type Feature = {
  tab: string;
  tag: string;
  title: React.ReactNode;
  body: string;
  bullets: string[];
  visual: React.ReactNode;
};

function MockCarousel() {
  return (
    <div className="flex flex-col gap-3 w-full max-w-[240px]">
      {['Gancho que prende', 'Conteúdo que educa', 'CTA que converte'].map((t, i) => (
        <div
          key={i}
          className="rounded-2xl px-5 py-4 text-left"
          style={{ background: i === 0 ? '#0A0A0A' : '#F4F4F2', color: i === 0 ? '#fff' : '#0A0A0A' }}
        >
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase opacity-50">Slide {i + 1}</p>
          <p className="text-[15px] font-bold tracking-tight mt-1">{t}</p>
        </div>
      ))}
    </div>
  );
}

function MockNews() {
  return (
    <div className="w-full max-w-[240px] rounded-2xl overflow-hidden text-left" style={{ border: '1px solid #ECECEA' }}>
      {/* News card de verdade, saído do produto — no lugar do retângulo chapado
          que estava aqui. A área é 4:5 igual ao arquivo, então a imagem entra
          inteira: nada de `cover` cortando a manchete, que é o conteúdo.
          A manchete inventada que existia embaixo ("IA generativa muda o jogo…")
          saiu junto: a imagem traz a manchete real dela, e duas manchetes
          diferentes no mesmo card se contradiziam. A tarja e a legenda ficam. */}
      <div className="relative aspect-[4/5] bg-[#1a1a1a]">
        <Image
          src="/news-card-exemplo.webp"
          alt="News card gerado no Creatools: matéria de Tecnologia com a manchete “Anthropic pode alcançar avaliação trilionária em um dos maiores IPOs da história”."
          fill
          sizes="240px"
          className="object-cover"
        />
      </div>
      <div className="p-4 bg-white">
        <span className="inline-block text-[9px] font-bold tracking-[0.16em] uppercase px-2 py-1 rounded bg-red-600 text-white">Notícia</span>
        <p className="text-[10px] mt-2" style={{ color: '#9A9A96' }}>Formato do feed · 1080×1350</p>
      </div>
    </div>
  );
}

/**
 * Os QUATRO templates que o wizard realmente oferece, na ordem do grid 2×2 de
 * components/editor/CreateWizard.tsx (`TEMPLATES`). O estilo `minimalist` segue
 * existindo no editor, mas não é oferecido na criação — por isso ele não
 * aparece aqui nem na copy. Os números de fonte saem de `FONT_PAIRS` no mesmo
 * arquivo: 7 pares, 13 fontes distintas (Inter se repete em dois pares).
 */
function MockTemplates() {
  const templates = ['Profile', 'Atelier', 'Manifesto', 'Radar'];
  return (
    <div className="w-full max-w-[260px]">
      <div className="grid grid-cols-2 gap-3">
        {templates.map((t) => (
          <div key={t} className="rounded-2xl p-4 bg-white text-left" style={{ border: '1px solid #ECECEA' }}>
            <p style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: '#0A0A0A' }}>Aa</p>
            <p className="text-[10.5px] font-semibold mt-2" style={{ color: '#0A0A0A' }}>{t}</p>
          </div>
        ))}
      </div>
      <p className="text-[10.5px] mt-3.5 text-center" style={{ color: '#9A9A96' }}>
        <b style={{ color: '#0A0A0A' }}>13 fontes</b> em 7 pares calibrados
      </p>
    </div>
  );
}

/**
 * Calendário de PLANEJAMENTO. O produto não publica nem agenda post no
 * Instagram — os dias marcados são o que a pessoa planejou postar, e nada aqui
 * (nem o rótulo) pode sugerir automação.
 */
function MockAgenda() {
  const planned = [3, 7, 10, 14, 17, 21, 24, 27];
  return (
    <div className="w-full max-w-[260px] rounded-2xl bg-white p-5 text-left" style={{ border: '1px solid #ECECEA' }}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold">Julho 2026</p>
        <p className="text-[10px]" style={{ color: '#9A9A96' }}>8 planejados</p>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mt-4">
        {Array.from({ length: 28 }, (_, i) => (
          <div
            key={i}
            className="aspect-square rounded-md grid place-items-center text-[8px]"
            style={{ background: planned.includes(i) ? '#0A0A0A' : '#F4F4F2', color: planned.includes(i) ? '#fff' : '#B5B5B0' }}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockPalette() {
  const colors = ['#0A0A0A', '#E4572E', '#F5C300', '#2B7A4B', '#F4F4F2'];
  return (
    <div className="w-full max-w-[260px] rounded-2xl bg-white p-6 text-left" style={{ border: '1px solid #ECECEA' }}>
      <p className="text-[12px] font-bold">Paleta da marca</p>
      {/* As bolinhas ENCOLHEM: com `w-9` fixo os cinco discos mais os vãos davam
          280px de largura mínima e estouravam a moldura no celular. Agora
          dividem o espaço disponível (flex-1) e o `max-w-9` mantém os 36px de
          sempre onde couber — no desktop nada muda. */}
      <div className="flex gap-2.5 mt-4 min-w-0">
        {colors.map((c) => (
          <div key={c} className="flex-1 min-w-0 max-w-9 aspect-square rounded-full" style={{ background: c, border: '1px solid #ECECEA' }} />
        ))}
      </div>
      <p className="text-[10px] mt-4" style={{ color: '#9A9A96' }}>Aplicada automaticamente em cada geração</p>
    </div>
  );
}

function MockAiImages() {
  return (
    <div className="w-full max-w-[240px] text-left">
      <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-[#1a1a1a]">
        <Image
          src="/landing/ai-images-card.webp"
          alt="Imagem de carrossel gerada por IA para um slide sobre branding e tecnologia"
          fill
          sizes="240px"
          className="object-cover"
        />
      </div>
      <div className="flex items-center justify-between mt-3">
        {/* Nada de modelo nem de fornecedor no selo — isso muda sem aviso e não
            é o que vende. O "5 créditos" fica: é preço, e bate com
            CREDIT_COSTS.image em lib/credits.ts. */}
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: '#9A9A96' }}>Feita pro seu slide</span>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#0A0A0A', color: '#fff' }}>5 créditos</span>
      </div>
    </div>
  );
}

/** Cantos de mira do cartao de entrada — puro enfeite, fora do leitor de tela. */
function MiraCorners() {
  const base = 'absolute w-4 h-4 border-white/70';
  return (
    <>
      <span className={`${base} top-2 left-2 border-t-2 border-l-2`} />
      <span className={`${base} top-2 right-2 border-t-2 border-r-2`} />
      <span className={`${base} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${base} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );
}

/**
 * Entrada (a foto de referencia) → saida (a imagem gerada a partir dela).
 * A direita nasce borrada e revela nitida, em loop, por CSS — ver
 * lp-render-reveal no LP_CSS.
 */
function MockFaceSwap() {
  return (
    /* A hierarquia e por flex-grow, nao por largura fixa: com basis 0, os dois
       cartoes dividem o espaco livre em 40/60, entao a direita (o resultado)
       nasce maior e a esquerda (a referencia) menor, em qualquer largura. A
       diferenca de altura vem sozinha do aspect-ratio, e `items-center` deixa
       as duas centradas na mesma linha.
       `min-w-0` nos dois e obrigatorio: item de flex nasce com min-width auto e
       sem isso eles se recusam a encolher no mobile, que foi exatamente o bug
       de overflow horizontal que o 2317b0e corrigiu nesta secao. */
    <div className="w-full max-w-[360px] flex items-center gap-2">
      <figure className="flex-[4] min-w-0">
        <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-[#111]">
          <Image
            src="/rosto-referencia.webp"
            alt="Foto de referencia enviada por quem cria o carrossel"
            fill
            sizes="(max-width: 768px) 75px, 130px"
            className="object-cover"
          />
          <MiraCorners />
        </div>
        <figcaption className="mt-2 text-[10px] font-bold tracking-[0.14em] uppercase text-center" style={{ color: '#9A9A96' }}>
          Analisado
        </figcaption>
      </figure>

      <ChevronRight className="w-5 h-5 shrink-0" strokeWidth={2.5} style={{ color: '#B5B5B0' }} aria-hidden="true" />

      <figure className="flex-[6] min-w-0">
        <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-[#111]">
          <Image
            src="/rosto-gerado.webp"
            alt="Imagem gerada pela IA com o mesmo rosto, em outro cenario"
            fill
            sizes="(max-width: 768px) 110px, 200px"
            className="object-cover lp-render-img"
          />
          <span
            className="lp-render-badge absolute inset-x-1.5 bottom-1.5 text-[7px] sm:text-[9px] font-bold tracking-[0.06em] sm:tracking-[0.1em] uppercase text-white text-center rounded px-1 py-0.5 sm:py-1"
            style={{ background: 'rgba(0,0,0,0.62)' }}
          >
            Gerando imagem…
          </span>
        </div>
        <figcaption className="mt-2 text-[10px] font-bold tracking-[0.14em] uppercase text-center" style={{ color: '#0A0A0A' }}>
          No seu slide
        </figcaption>
      </figure>
    </div>
  );
}

const FEATURES: Feature[] = [
  {
    tab: 'Carrossel',
    tag: 'O carro-chefe',
    title: (<>Carrosséis completos <span style={{ color: '#8B8B87' }}>a partir de uma frase</span></>),
    body: 'Você digita o tema, a IA escreve título, subtítulo e o texto de cada slide, com gancho de abertura e CTA de fechamento. Tudo editável num editor visual, slide por slide.',
    bullets: [
      '4 templates prontos: Profile (cara de thread do X), Atelier, Manifesto e Radar',
      'Gancho, desenvolvimento e CTA escritos pela IA',
      'Editor visual completo pra ajustar tudo antes de exportar',
    ],
    visual: <MockCarousel />,
  },
  {
    tab: 'Notícias',
    tag: 'Poste o assunto do momento',
    title: (<>Transforme notícias em posts <span style={{ color: '#8B8B87' }}>antes de todo mundo</span></>),
    body: 'Monte o news card da notícia do seu nicho e publique enquanto o assunto ainda está em alta. Formato jornalístico que passa autoridade e pega o alcance de quem publica primeiro.',
    bullets: [
      'Card no formato ideal do feed (1080×1350)',
      'Manchete, resumo e imagem no layout jornalístico',
      'Edite qualquer texto antes de exportar',
    ],
    visual: <MockNews />,
  },
  {
    tab: 'Templates',
    tag: 'Escala com padrão',
    title: (<>Templates prontos, <span style={{ color: '#8B8B87' }}>identidade sempre igual</span></>),
    body: 'Quatro templates pra escolher e 13 fontes em 7 pares calibrados. Todo post sai com a mesma cara: consistência visual de quem está crescendo de verdade.',
    bullets: [
      'Profile, Atelier, Manifesto e Radar',
      '13 fontes em 7 pares calibrados por designers',
      'Mesmo padrão em todos os posts, sem esforço',
    ],
    visual: <MockTemplates />,
  },
  {
    tab: 'Agenda de conteúdo',
    tag: 'Nunca mais sem saber o que postar',
    title: (<>Seu mês inteiro organizado <span style={{ color: '#8B8B87' }}>num calendário</span></>),
    // O Creatools NÃO publica nem agenda no Instagram: aqui é planejamento.
    // Nada nesta entrada pode sugerir automação — nem "agende", nem "publique
    // por você".
    body: 'Planeje carrosséis e news cards num único calendário. Escolha o dia de cada post e veja o mês inteiro de uma vez: você chega no dia já sabendo o que vai publicar. Acabou o “o que eu posto hoje?”.',
    bullets: [
      'Visão do mês inteiro com tudo que você planejou',
      'Carrosséis e news cards no mesmo lugar',
      'Organiza a sua agenda de postagens — publicar continua com você',
    ],
    visual: <MockAgenda />,
  },
  {
    tab: 'Paleta de cor',
    tag: 'Branding automático',
    title: (<>As cores da sua marca <span style={{ color: '#8B8B87' }}>em todos os posts</span></>),
    body: 'Defina a paleta da sua marca uma única vez. Todos os carrosséis gerados já saem com as suas cores, sem retrabalho e sem post fora da identidade.',
    bullets: [
      'Paleta salva no seu perfil',
      'Aplicada automaticamente em cada geração',
      'Consistência visual em todo o feed',
    ],
    visual: <MockPalette />,
  },
  {
    tab: 'Imagens com IA',
    tag: 'Sem banco de imagem genérico',
    title: (<>Imagens geradas por IA <span style={{ color: '#8B8B87' }}>sob medida pro seu slide</span></>),
    // Sem nome de modelo e sem fornecedor: motor troca, a promessa não. O custo
    // de 5 créditos é CREDIT_COSTS.image (lib/credits.ts) — conferido.
    body: 'Você diz o assunto e a imagem sai pronta pro slide. Sem mega prompt, sem precisar saber “falar com IA”: cada imagem nasce sob medida pro contexto daquele slide, exclusiva sua. Cada imagem custa 5 créditos do seu plano.',
    bullets: [
      'Sem prompt complicado: você diz o assunto, a imagem sai pronta',
      'Feita pro feed, com alto potencial de viralizar — não é banco de imagem',
      '5 créditos por imagem gerada',
    ],
    visual: <MockAiImages />,
  },
  {
    tab: 'Seu rosto no carrossel',
    tag: 'Geração com referência',
    title: (<>Seu rosto <span style={{ color: '#8B8B87' }}>dentro do carrossel</span></>),
    // CONFERIDO NO CÓDIGO antes de escrever: a referência existe de verdade —
    // AiGenPanel envia `referenceImageUrl`, a rota app/api/generate-image chama
    // openai.images.edit com o arquivo baixado por downloadReferenceImage, e o
    // evento sai como generationType 'edit'. É uma imagem de referência
    // OPCIONAL, anexada a cada geração; o produto não tem trava de identidade
    // nem repete o rosto sozinho pelos slides. A copy fala do que existe: você
    // anexa a foto, a IA gera a partir dela, e repetir a referência é ação sua.
    body: 'Anexe uma foto na hora de gerar a imagem do slide e a IA cria a cena a partir dela: você em outro cenário, com outra roupa, sem marcar sessão de fotos. Serve pra sua foto ou pra do seu cliente.',
    bullets: [
      'Anexe a foto de referência na hora de gerar',
      'Use a mesma referência slide a slide pra manter a pessoa no carrossel',
      '5 créditos por imagem, como qualquer geração',
    ],
    visual: <MockFaceSwap />,
  },
];

/** Tempo de leitura de uma aba antes de passar pra próxima. */
const FEATURE_ROTATE_MS = 4500;

function Features() {
  const [active, setActive] = useState(2);
  /** Clique do usuário: ele escolheu uma aba pra ler, a rotação acaba ali. */
  const [locked, setLocked] = useState(false);
  /** Ponteiro dentro do bloco: pausa enquanto estiver lá. */
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);

  // Rotação automática das abas.
  //
  // `reducedMotion` NÃO entra aqui de propósito. Trocar de aba é troca de
  // CONTEÚDO, não movimento — quem pediu menos animação quer o fade desligado
  // (isso acontece no motion.div abaixo), não a seção congelada numa aba só.
  // Com o guard aqui, quem tem "Reduzir movimento" ligado no sistema via a
  // seção parada e precisava clicar pra ver qualquer outra aba.
  //
  // A pausa é resolvida NO TICK, consultando o hover real no DOM, em vez de
  // confiar só no evento de saída: se o ponteiro entra e a pessoa rola a página
  // sem mexer o mouse, o pointerleave pode nunca chegar e a rotação morria em
  // silêncio para sempre. Aqui o pior caso é uma volta a mais.
  //
  // O efeito não depende de `active` — quem avança é o updater funcional —,
  // então o intervalo não é recriado a cada troca, e o cleanup mata o timer no
  // unmount e a cada mudança de condição.
  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => {
      const el = cardRef.current;
      if (paused && el?.matches(':hover')) return;
      // Chegou aqui com `paused` ligado: o ponteiro já saiu e o evento se
      // perdeu. Destrava em vez de ficar preso.
      if (paused) setPaused(false);
      setActive((i) => (i + 1) % FEATURES.length);
    }, FEATURE_ROTATE_MS);
    return () => clearInterval(id);
  }, [locked, paused]);

  return (
    <section id="recursos" className="py-16 md:py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center">
          <span className="lp-badge outline">Vários recursos exclusivos</span>
          <h2 className="mt-5 mx-auto text-center font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
            Tudo que você precisa pra
            <br />
            <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">crescer no Instagram</span>
          </h2>
          <p className="mt-4 text-[17px] max-w-xl mx-auto" style={{ color: 'var(--lp-gray)' }}>
            Um estúdio completo dentro do Creatools. Veja os recursos mais usados em ação.
          </p>
        </FadeUp>

        {/* Tabs */}
        <FadeUp delay={0.1} className="mt-12 flex justify-center">
          <div
            className="inline-flex flex-wrap justify-center gap-1 p-1.5 rounded-[28px] md:rounded-full"
            style={{ border: '1px solid var(--lp-line)' }}
          >
            {FEATURES.map((feat, i) => (
              <button
                key={feat.tab}
                type="button"
                onClick={() => {
                  setActive(i);
                  setLocked(true);
                }}
                aria-pressed={i === active}
                className="relative px-4 md:px-5 py-2.5 rounded-full text-[11.5px] md:text-[12.5px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: i === active ? '#fff' : 'var(--lp-gray-2)', transition: 'color 250ms ease' }}
              >
                {i === active && (
                  <motion.span
                    layoutId="feature-tab-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--lp-black)' }}
                    transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative z-10">{feat.tab}</span>
              </button>
            ))}
          </div>
        </FadeUp>

        {/* Feature card */}
        <FadeUp delay={0.15} className="mt-8">
          {/* A moldura preta NÃO tem key e NÃO remonta: ela é o container, e
              antes trocava de key junto com a aba. Remontar o bloco inteiro a
              cada 4,5s era o "pisca" — ele saía de opacity 0 e voltava, e de
              quebra mudava de altura porque cada aba tem conteúdo de tamanho
              diferente, fazendo o resto da página pular junto. */}
          <div
            ref={cardRef}
            /* Pausa enquanto a pessoa está lendo o bloco. Pointer* em vez de
               mouse*: cobre toque e caneta, que o mouse* ignora. Um evento de
               saída perdido não trava nada — o tick reconfere o hover real. */
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            className="rounded-[36px] p-8 md:p-14"
            style={{ background: 'var(--lp-black)', color: '#fff' }}
          >
            {/* TODAS as abas ficam montadas, empilhadas na MESMA célula deste
                grid (todo mundo em `1 / 1`). Duas consequências, que são
                exatamente o que se quer:
                  · a altura do bloco é a do maior conteúdo e não muda nunca —
                    sem salto, sem medir nada em JS;
                  · o cross-fade é de verdade, porque a aba que sai e a que
                    entra dividem o mesmo espaço em vez de se empurrarem.
                As inativas ficam com opacity 0 + inert: somem da navegação por
                teclado e do leitor de tela, não só da vista. */}
            <div className="grid min-w-0">
              {FEATURES.map((feat, i) => {
                const isActive = i === active;
                return (
                  <div
                    key={feat.tab}
                    className="grid md:grid-cols-[1.1fr_0.9fr] gap-10 items-center min-w-0"
                    /* Transição em CSS, não em JS. O framer anima por
                       requestAnimationFrame, e além de ser mais peça para o
                       mesmo efeito, o estado real ficava impossível de auditar:
                       em documento em segundo plano o rAF congela e a opacidade
                       nunca era escrita. Aqui o valor vive no style inline, então
                       o HTML do servidor já sai com uma camada visível e cinco em
                       zero — sem as seis empilhadas no primeiro paint — e o
                       navegador faz a interpolação sozinho.

                       Só opacidade: o `y: 12` de antes era o que mais endurecia a
                       troca. A que entra é mais lenta e começa um pouco depois da
                       que sai; sem essa defasagem as duas se somam no meio e o
                       texto "engrossa" durante a transição.

                       Com reduced-motion a troca é instantânea — mas continua
                       acontecendo (a rotação não depende disto). */
                    style={{
                      gridArea: '1 / 1',
                      opacity: isActive ? 1 : 0,
                      transition: reducedMotion
                        ? 'none'
                        : `opacity ${isActive ? 650 : 350}ms cubic-bezier(0.33, 1, 0.68, 1) ${isActive ? 100 : 0}ms`,
                    }}
                    aria-hidden={!isActive}
                    inert={!isActive}
                  >
                    <div className="min-w-0">
                      <span className="lp-badge on-dark">{feat.tag}</span>
                      <h3 className="lp-h mt-6" style={{ fontSize: 'clamp(28px, 3.4vw, 44px)' }}>{feat.title}</h3>
                      <p className="mt-5 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{feat.body}</p>
                      <ul className="mt-6 space-y-2.5">
                        {feat.bullets.map((b) => (
                          <li key={b} className="flex items-start gap-2.5 text-[14.5px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                            <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-white/50 shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-[24px] bg-white min-h-[360px] md:min-h-[420px] grid place-items-center min-w-0 p-5 sm:p-8">
                      {feat.visual}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ─── Marquee ─────────────────────────────────────────────────── */

/**
 * Clientes reais, com a foto e o @ de cada um. O mapeamento foto→@ veio fechado
 * do Rafael e NÃO deve ser reordenado por conveniência de layout: cada rosto é
 * de uma pessoa e trocar o @ de lugar atribui a fala errada a alguém.
 *
 * São 11. A lista de @s tinha 12 — @viniciusramos_ ficou sem foto e por isso
 * está de fora de propósito. Não repita ninguém nem invente um 12º rosto para
 * "fechar" a conta.
 */
const MARQUEE_ITEMS = [
  { src: '/clientes/cliente-01.webp', handle: '@marianacosta_' },
  { src: '/clientes/cliente-02.webp', handle: '@gabriel.monteiro' },
  { src: '/clientes/cliente-03.webp', handle: '@lucasvieiraa' },
  { src: '/clientes/cliente-04.webp', handle: '@carolalmeida_' },
  { src: '/clientes/cliente-05.webp', handle: '@isabellamoraes' },
  { src: '/clientes/cliente-06.webp', handle: '@andrehsilva' },
  { src: '/clientes/cliente-07.webp', handle: '@lari.freitas' },
  { src: '/clientes/cliente-08.webp', handle: '@ricardo.mattos' },
  { src: '/clientes/cliente-09.webp', handle: '@thiagolimaa' },
  { src: '/clientes/cliente-10.webp', handle: '@nathsouza_' },
  { src: '/clientes/cliente-11.webp', handle: '@biancamartins_' },
];

const PEOPLE_SPHERE_ADDITIONAL_IMAGES: ImageData[] = [
  { id: 'people-who-use-portrait-01', src: '/people-who-use/portrait-01.webp', alt: 'Pessoa usuária do Creatools' },
  { id: 'people-who-use-portrait-02', src: '/people-who-use/portrait-02.webp', alt: 'Pessoa usuária do Creatools' },
  { id: 'people-who-use-portrait-03', src: '/people-who-use/portrait-03.webp', alt: 'Pessoa usuária do Creatools' },
  { id: 'people-who-use-portrait-04', src: '/people-who-use/portrait-04.webp', alt: 'Pessoa usuária do Creatools' },
  { id: 'people-who-use-portrait-05', src: '/people-who-use/portrait-05.webp', alt: 'Pessoa usuária do Creatools' },
  { id: 'people-who-use-portrait-06', src: '/people-who-use/portrait-06.webp', alt: 'Pessoa usuária do Creatools' },
  ...Array.from({ length: 27 }, (_, index) => {
    const portraitNumber = String(index + 7).padStart(2, '0');
    return {
      id: `people-who-use-generated-${portraitNumber}`,
      src: `/people-who-use/portrait-${portraitNumber}.webp`,
      alt: 'Pessoa usuária do Creatools',
    };
  }),
  ...Array.from({ length: 16 }, (_, index) => {
    const externalNumber = String(index + 1).padStart(2, '0');
    return {
      id: `people-who-use-external-${externalNumber}`,
      src: `/people-who-use/external-${externalNumber}.webp`,
      alt: 'Pessoa usuária do Creatools',
    };
  }),
];

const PEOPLE_SPHERE_REAL_IMAGES: ImageData[] = [
  ...PEOPLE_SPHERE_ADDITIONAL_IMAGES,
  ...MARQUEE_ITEMS.map((item) => ({
    id: item.handle,
    src: item.src,
    alt: `Cliente ${item.handle}`,
    title: item.handle,
  })),
];

const PEOPLE_SPHERE_SLOT_COUNT = 60;

const PEOPLE_SPHERE_IMAGES: ImageData[] = PEOPLE_SPHERE_REAL_IMAGES;

/**
 * Repetições do conjunto na faixa. Tem que ser PAR: a animação desloca a trilha
 * em -50%, então a metade precisa cair exatamente sobre um número inteiro de
 * conjuntos — senão a emenda salta no fim do ciclo. E a metade precisa ser mais
 * larga que a tela, senão sobra vão em branco na direita.
 * 6 × 11 itens = 66; a metade são 33 itens × 96px = 3168px, o que cobre com
 * folga qualquer monitor comum.
 */
const MARQUEE_REPEATS = 6;

function Marquee() {
  const items = Array.from({ length: MARQUEE_REPEATS }, () => MARQUEE_ITEMS).flat();
  return (
    <section className="lp-marquee py-4 overflow-hidden bg-[#F7F7F7]">
      <div
        className="lp-marquee-track"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
        }}
      >
        {items.map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-2 mx-2 shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-white" style={{ border: '3px solid #fff', boxShadow: '0 2px 10px -2px rgba(0,0,0,0.18)' }}>
              {/* Tirei o anel colorido dos emojis: com rostos de verdade, uma cor
                  por pessoa não quer dizer nada e só polui. O aro branco separa a
                  foto do fundo cinza da faixa.
                  `alt` com o @ porque são pessoas — alt vazio aqui apagaria 11
                  clientes do leitor de tela. As repetições da trilha são
                  decorativas, então só o primeiro conjunto é anunciado. */}
              <Image
                src={item.src}
                alt={i < MARQUEE_ITEMS.length ? `Cliente ${item.handle}` : ''}
                aria-hidden={i >= MARQUEE_ITEMS.length}
                width={160}
                height={160}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-[13px]" style={{ color: 'var(--lp-gray)' }}>{item.handle}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Resultados reais ────────────────────────────────────────── */

function Results() {
  return (
    <section className="py-16 md:py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto text-center">
        <FadeUp>
          <span className="lp-badge soft">Resultados reais</span>
          <h2 className="mt-5 max-w-3xl mx-auto text-center font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl md:whitespace-nowrap">
            Veja o tipo de post que você vai
            <br />
            <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">criar com o Creatools</span>
          </h2>
          <p className="mt-4 text-[16px]" style={{ color: 'var(--lp-gray)' }}>
            Carrosséis e news cards gerados dentro da plataforma. Sem Canva, sem Photoshop, sem designer.
          </p>
        </FadeUp>

        <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {/* Atelier */}
          <FadeUp delay={0}>
            <div className="aspect-[4/5] rounded-[20px] p-6 flex flex-col justify-between text-left" style={{ background: '#0A0A0A', color: '#fff' }}>
              <span className="text-[9px] font-semibold tracking-[0.2em] uppercase opacity-45">Atelier</span>
              <p className="lp-h text-[19px] md:text-[22px]">5 erros que travam seu crescimento</p>
              <span className="text-[10px] opacity-35">@orafaelrocha_</span>
            </div>
          </FadeUp>
          {/* Radar (valor interno `template02`). A seção promete "o tipo de post que
              você VAI criar", então todo rótulo aqui tem que ser um template que o
              wizard oferece — o `minimalist` não é. Dos quatro reais, este card é o
              Radar: o creme é o token `paper` do spec (#EEE5D9, fundo dos slides
              internos), e é o único creme entre os templates de verdade. O Atelier
              já é o card ao lado e o Profile é o card de thread, à direita. */}
          <FadeUp delay={0.07}>
            <div className="aspect-[4/5] rounded-[20px] p-6 flex flex-col justify-between text-left" style={{ background: '#EEE5D9' }}>
              <span className="text-[9px] font-semibold tracking-[0.2em] uppercase" style={{ color: '#B5B5B0' }}>Radar</span>
              <p className="lp-h text-[19px] md:text-[22px]">Rotina de conteúdo em 30 min por dia</p>
              <span className="text-[10px]" style={{ color: '#B5B5B0' }}>@orafaelrocha_</span>
            </div>
          </FadeUp>
          {/* Thread X */}
          <FadeUp delay={0.14}>
            <div className="aspect-[4/5] rounded-[20px] p-6 flex flex-col justify-between text-left bg-white" style={{ border: '1px solid var(--lp-line)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full" style={{ background: '#0A0A0A' }} />
                <div>
                  <p className="text-[12px] font-bold leading-none">Rafael Rocha</p>
                  <p className="text-[10px] mt-1" style={{ color: '#9A9A96' }}>@orafaelrocha_</p>
                </div>
              </div>
              <p className="text-[15px] md:text-[16px] font-medium leading-snug">
                Ninguém te conta isso sobre consistência no Instagram: 🧵
              </p>
              <div className="flex items-center gap-4" style={{ color: '#B5B5B0' }}>
                <MessageCircle className="w-3.5 h-3.5" />
                <Repeat2 className="w-3.5 h-3.5" />
                <Heart className="w-3.5 h-3.5" />
              </div>
            </div>
          </FadeUp>
          {/* News */}
          <FadeUp delay={0.21}>
            <div className="aspect-[4/5] rounded-[20px] overflow-hidden flex flex-col text-left" style={{ border: '1px solid var(--lp-line)' }}>
              <div className="flex-1" style={{ background: 'linear-gradient(135deg, #1a1a1a, #3d3d3a)' }} />
              <div className="p-5 bg-white">
                <span className="inline-block text-[8px] font-bold tracking-[0.16em] uppercase px-2 py-0.5 rounded bg-red-600 text-white">Notícia</span>
                <p className="text-[14px] font-bold tracking-tight leading-snug mt-2">IA generativa muda o jogo do marketing</p>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

function PeopleWhoUse() {
  return (
    <section
      aria-labelledby="people-who-use-title"
      className="overflow-hidden bg-[#F7F7F7] px-6 py-16 md:py-24"
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,720px)] lg:gap-16">
        <div className="text-center md:text-left">
          <h2
            id="people-who-use-title"
            className="font-display text-center text-4xl font-bold tracking-tighter sm:text-5xl md:text-left md:text-6xl"
          >
            Pessoas que <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">usam</span>
          </h2>
        </div>

        <div className="flex min-w-0 justify-center overflow-hidden">
          <SphereImageGrid
            images={PEOPLE_SPHERE_IMAGES}
            containerSize={720}
            sphereRadius={250}
            dragSensitivity={0.8}
            momentumDecay={0.96}
            maxRotationSpeed={6}
            baseImageScale={0.22}
            perspective={1000}
            autoRotate
            autoRotateSpeed={0.2}
            responsive
            className="w-full max-w-[720px]"
          />
        </div>
      </div>
    </section>
  );
}

/* ─── Faça as contas ──────────────────────────────────────────── */

const COSTS = [
  { logo: '/canva_logo.png', name: 'Canva Pro (design)', price: 'R$ 49,90/mês' },
  { logo: '/openai_logo.png', name: 'ChatGPT Plus (textos e ideias)', price: 'R$ 99,00/mês' },
  { logo: '/gemini_logo.png', name: 'Google Gemini (IA de imagem)', price: 'R$ 79,00/mês' },
  { logo: '/ps_logo.png', name: 'Photoshop (editor profissional)', price: 'R$ 89,00/mês' },
  { icon: '🧑‍🎨', name: 'Designer Freelancer (layout)', price: 'R$ 250/mês' },
  { icon: '✍️', name: 'Copywriter Freelancer (roteiros)', price: 'R$ 85/mês' },
];

function DoTheMath() {
  return (
    <section className="py-24 md:py-32 px-6" style={{ background: '#000' }}>
      <div className="max-w-3xl mx-auto text-center">
        <FadeUp>
          <span className="lp-badge on-dark">Faça as contas</span>
          <h2 className="mt-5 mx-auto text-center font-display text-4xl font-bold tracking-tighter text-white sm:text-5xl md:text-6xl md:whitespace-nowrap">
            Quanto você pagaria <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">separado</span>
            <br /> por tudo isso?
          </h2>
        </FadeUp>

        <FadeUp delay={0.1}>
          <div className="mt-12 rounded-[24px] p-2" style={{ background: '#111110' }}>
            {COSTS.map((c, i) => (
              <div
                key={c.name}
                className="flex items-center justify-between gap-4 px-5 py-4"
                style={{ borderBottom: i < COSTS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
              >
                <div className="flex items-center gap-4 text-left">
                  {c.logo ? (
                    <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 p-2" style={{ background: '#1E1E1D' }}>
                      <Image src={c.logo} alt="" width={24} height={24} className="w-full h-full object-contain" />
                    </span>
                  ) : (
                    <span
                      className="w-10 h-10 rounded-xl grid place-items-center text-[16px] font-bold shrink-0"
                      style={{ background: '#1E1E1D', color: '#fff' }}
                    >
                      {c.icon}
                    </span>
                  )}
                  <span className="text-[15px]" style={{ color: 'rgba(255,255,255,0.85)' }}>{c.name}</span>
                </div>
                <span className="text-[14px] line-through shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.price}</span>
              </div>
            ))}
          </div>
        </FadeUp>

        <FadeUp delay={0.18}>
          <div
            className="mt-6 rounded-[24px] px-7 py-6 flex flex-col sm:flex-row items-center justify-between gap-6"
            style={{ background: '#111110', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="text-left">
              <p className="text-[26px] font-bold line-through" style={{ color: 'rgba(255,255,255,0.35)' }}>~R$ 652/mês</p>
              <p className="text-[14px] mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                No Creatools, tudo está reunido por menos de 10% desse valor.
              </p>
            </div>
            <a href="#planos" className="lp-btn white shrink-0 !rounded-full">
              Ver planos <ArrowChip />
            </a>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ─── Planos ──────────────────────────────────────────────────── */

// Só existem planos pagos: o plano gratuito foi removido do produto (o backend
// dele saiu na migration 20260812). Nada aqui pode prometer acesso sem assinar.
// A agenda NÃO é exclusiva de plano: /agenda não tem trava nenhuma (a policy
// scheduled_posts_owner só compara auth.uid() = user_id, a tabela não tem
// trigger de limite e o proxy só exige sessão).
// A IA devolve title/description/highlightWord/backgroundColor por slide, mais
// caption e hashtags (types/index.ts: SlideAIData e CarouselAIResponse). Layout,
// fontes e formato são escolha do usuário no wizard — não venha escrever que a
// IA gera "layout" ou "design".
const PLAN_FEATURES = [
  // "Ilimitados" só pôde entrar porque o PRODUTO mudou: CREDIT_COSTS.carousel
  // virou 0 e gerar carrossel não debita mais nada (lib/credits.ts). Se o custo
  // voltar a ser > 0, esta linha vira promessa falsa e tem que sair junto.
  'Carrosséis ilimitados',
  // Sem custo escrito aqui: o preço da imagem já aparece na faixa de créditos e
  // no FAQ, e repetir número em três lugares é onde a copy diverge do código.
  'Imagens com IA',
  // O que a IA devolve de verdade: título, descrição, palavra de destaque e cor
  // por slide, mais legenda e hashtags (types/index.ts). Ela NÃO gera layout nem
  // design — não escreva "cria seu post" nem "monta o design".
  'IA que escreve os textos, a legenda e as hashtags',
  // Calendário é PLANEJAMENTO: o produto não publica nem agenda no Instagram.
  'Agenda de conteúdo',
  // "Drag & drop" aqui é só o que existe: arrastar card de slide reordena
  // (reorderSlides via @hello-pangea/dnd em SlideCanvas.tsx) e soltar arquivo de
  // imagem sobe a imagem (DropZone em EditorSidebar.tsx). NÃO é editor de
  // arrastar elemento livre na tela.
  'Editor Drag & Drop',
  'Export Full HD',
];

function Pricing() {
  // Escolher um plano abre o popup de captura de lead (nome/e-mail/telefone) —
  // o MESMO fluxo do /precos (CheckoutButton → LeadCaptureModal). O e-mail
  // coletado vira um lead e o id dele segue para o checkout do Asaas; a landing
  // não vai direto ao checkout nem pula a captura de lead.
  const [modalInterval, setModalInterval] = useState<'month' | 'year' | null>(null);

  // Altura é requisito aqui: a seção precisa caber numa viewport de desktop
  // (~800px de altura útil) sem obrigar a rolar. Os paddings, o respiro da grade
  // e o corpo do preço estão calibrados para isso — é a razão de eles serem
  // menores que os das outras seções. No mobile pode rolar à vontade, então os
  // valores base ficam confortáveis e só o md: aperta.
  return (
    <section id="planos" className="py-16 md:py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center">
          <span className="lp-badge soft">Comece agora</span>
          <h2 className="mt-5 mx-auto text-center font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
            Escolha a melhor opção
            <br />
            <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">para começar</span>
          </h2>
          <p className="mt-4 text-[15px]" style={{ color: 'var(--lp-gray)' }}>
            Checkout seguro (cartão de crédito). Sem fidelidade. Cancele quando quiser.
          </p>
        </FadeUp>

        {/* Dois planos, não três: grade de 2 colunas e centrada. Manter
            md:grid-cols-3 deixaria um buraco de coluna vazia. */}
        <div className="mt-8 grid md:grid-cols-2 gap-5 max-w-3xl mx-auto items-start">
          {/* Mensal */}
          <FadeUp delay={0.05}>
            <div className="rounded-[28px] p-7" style={{ background: 'var(--lp-band)' }}>
              <span className="lp-badge" style={{ background: 'var(--lp-black)', color: '#fff', fontSize: 11, padding: '7px 14px' }}>
                Plano Mensal
              </span>
              <div className="mt-5 flex items-baseline">
                <span className="lp-h" style={{ fontSize: 46 }}>R$59</span>
                <span className="text-[22px] font-bold" style={{ color: 'var(--lp-gray)' }}>,50</span>
                <span className="ml-2 text-[14px]" style={{ color: 'var(--lp-gray)' }}>/mês</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'var(--lp-gray-2)' }}>
                Cobrado mês a mês. Sem fidelidade.
                <br />Equivale a ~R$1,98/dia
              </p>
              <div className="mt-4 -mx-7 px-7 py-2.5" style={{ background: '#EBEBE9' }}>
                <p className="text-[13px] font-bold tracking-tight">200 CRÉDITOS TODO MÊS</p>
                {/* Com o carrossel grátis, crédito é só de imagem: 200 ÷ 5
                    (CREDIT_COSTS.image) = 40 imagens. */}
                <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--lp-gray-2)' }}>Até 40 imagens com IA</p>
              </div>
              <ul className="mt-3 space-y-1.5">
                {PLAN_FEATURES.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: 'var(--lp-gray-2)' }}>
                    <Check className="w-4 h-4 mt-[2px] shrink-0" strokeWidth={3} style={{ color: 'var(--lp-black)' }} aria-hidden="true" />
                    {perk}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setModalInterval('month')}
                className="lp-btn white w-full justify-between mt-5 !bg-white !rounded-full"
              >
                Assinar Plano Mensal <ArrowChip />
              </button>
            </div>
          </FadeUp>

          {/* Anual */}
          <FadeUp delay={0.1}>
            <div
              className="rounded-[28px] p-7 relative"
              style={{ background: 'var(--lp-black)', color: '#fff', boxShadow: '0 0 0 2px #fff, 10px 10px 0 0 var(--lp-black)' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="lp-badge" style={{ background: '#fff', color: 'var(--lp-black)', fontSize: 11, padding: '7px 14px' }}>
                  Plano Anual
                </span>
                {/* "Melhor custo-benefício" é conta: 499 contra 714 por ano.
                    O selo da referência trazia junto "MAIS ESCOLHIDO" e isso
                    ficou de fora de propósito — é prova social, não temos base
                    pagante que sustente, e alegação de popularidade inventada
                    numa página que cobra é propaganda enganosa. */}
                {/* Curto de propósito: com o texto longo os dois selos
                    quebravam em duas linhas e a seção deixava de caber na tela.
                    O "~30%" não se perdeu — está na conta logo abaixo. */}
                <span className="lp-badge" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '7px 14px' }}>
                  Melhor custo-benefício
                </span>
              </div>
              <div className="mt-5 flex items-baseline gap-2.5 flex-wrap">
                {/* 12 × R$59,50 = R$714. Preço cheio riscado é a conta do mesmo
                    período no plano mensal, não um "de/por" inventado. */}
                <s className="text-[19px] font-bold" style={{ color: 'rgba(255,255,255,0.45)' }}>R$714</s>
                <span className="lp-h" style={{ fontSize: 46 }}>R$499</span>
                <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>/ano</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                ~R$41,58/mês, ~R$1,37/dia. No mensal, 12 meses sairiam R$714:
                você economiza R$215 (~30%).
              </p>
              <div className="mt-4 -mx-7 px-7 py-2.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <p className="text-[13px] font-bold tracking-tight">300 CRÉDITOS TODO MÊS</p>
                <p className="text-[11.5px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Até 60 imagens com IA</p>
              </div>
              <ul className="mt-3 space-y-1.5">
                {PLAN_FEATURES.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    <Check className="w-4 h-4 mt-[2px] shrink-0 text-white" strokeWidth={3} aria-hidden="true" />
                    {perk}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setModalInterval('year')}
                className="lp-btn white w-full justify-between mt-5 !rounded-full"
              >
                Assinar Plano Anual <ArrowChip solid />
              </button>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.15}>
          <p className="mt-5 text-center text-[13.5px]" style={{ color: 'var(--lp-gray)' }}>
            Precisa de ajuda? Fale com a gente no WhatsApp <Canais />. Respondemos rápido.
          </p>
        </FadeUp>

        {modalInterval && (
          <LeadCaptureModal
            interval={modalInterval}
            planLabel={modalInterval === 'year' ? 'Anual' : 'Mensal'}
            onClose={() => setModalInterval(null)}
          />
        )}
      </div>
    </section>
  );
}

/* ─── FAQ ─────────────────────────────────────────────────────── */

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Preciso saber design?',
    a: 'Não. A IA escreve o texto no tom e nas cores da sua marca. Você só digita o tema e, se quiser, ajusta qualquer detalhe no editor visual antes de exportar.',
  },
  {
    q: 'Como funcionam os créditos?',
    a: 'Cada plano vem com créditos mensais que renovam automaticamente (200 no mensal, 300 no anual). Um carrossel completo custa 5 créditos e cada imagem gerada com IA custa 5. O editor de news cards não consome créditos.',
  },
  {
    q: 'Quantos posts posso criar por mês?',
    a: 'Com o plano mensal, até 40 carrosséis por mês; no anual, até 60. Como o editor de news cards não consome créditos, eles não entram nessa conta. Pra quem posta todo dia, sobra crédito.',
  },
  {
    q: 'Funciona para qualquer nicho?',
    a: 'Sim. Marketing, fitness, nutrição, finanças, moda, educação, coaching: você define o tema e o tom, e a IA adapta o conteúdo ao seu nicho.',
  },
  {
    q: 'O Creatools publica automaticamente no Instagram?',
    a: 'Não. O Creatools cria e organiza seus posts num calendário de planejamento. A publicação você faz direto no Instagram com o arquivo exportado em Full HD, sem conectar sua conta a ferramentas de terceiros e sem risco pro seu perfil.',
  },
  {
    q: 'Como funciona a geração de imagens com IA?',
    a: 'Você diz o assunto e a imagem sai pronta pro slide, sob medida pro contexto dele — sem precisar escrever prompt. Cada imagem custa 5 créditos do seu plano, o mesmo saldo que os carrosséis usam.',
  },
  {
    q: 'Preciso de ajuda com minha assinatura, como faço?',
    a: (
      <>
        Você gerencia tudo com a gente no WhatsApp <Canais />: trocar de plano, atualizar forma
        de pagamento ou cancelar. Respondemos rápido pra qualquer dúvida.
      </>
    ),
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim. Sem fidelidade e sem multa. O acesso continua ativo até o fim do período já pago.',
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-16 md:pb-24 px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <FadeUp className="text-center">
          <span className="lp-badge soft">FAQ</span>
          <h2 className="mt-5 mx-auto text-center font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
            Perguntas <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">frequentes</span>
          </h2>
        </FadeUp>

        <div className="mt-12 space-y-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <FadeUp key={i} delay={i * 0.04}>
                <div
                  className="rounded-[22px] overflow-hidden transition-colors"
                  style={isOpen ? { background: '#fff', border: '1px solid var(--lp-line)' } : { background: 'var(--lp-band)', border: '1px solid transparent' }}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-7 py-4 text-left"
                  >
                    <span className="text-[16px] font-semibold tracking-tight">{item.q}</span>
                    <span
                      className="w-9 h-9 rounded-full grid place-items-center shrink-0"
                      style={isOpen ? { border: '1px solid var(--lp-line)', color: 'var(--lp-black)' } : { background: 'var(--lp-black)', color: '#fff' }}
                    >
                      {isOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        style={{ overflow: 'hidden' }}
                      >
                        <p className="px-7 pb-5 text-[14.5px] leading-relaxed" style={{ color: 'var(--lp-gray-2)' }}>
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeUp>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA final ───────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="pb-24 md:pb-32 px-6 text-center bg-white">
      <FadeUp>
        <Image src="/ICON_SEMFUNDO.png" alt="Creatools" width={129} height={129} className="mx-auto object-contain" />
        <h2 className="mt-5 mx-auto text-center font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
          Comece a publicar com
          <br />
          <span className="bg-gradient-to-r from-[#E4572E] to-[#FFA0DE] bg-clip-text text-transparent">consistência de verdade</span>
        </h2>
        <p className="mt-5 text-[16px] max-w-md mx-auto" style={{ color: 'var(--lp-gray)' }}>
          Escolha o plano, a IA já está ativa. Em minutos você tem o primeiro carrossel pronto.
        </p>
        <div className="mt-9">
          <a href="#planos" className="lp-btn black flat">
            Ver planos e assinar <ArrowChip dark />
          </a>
        </div>
        <p className="mt-6 text-[13.5px]" style={{ color: 'var(--lp-gray)' }}>
          Acesso imediato · Conteúdo pronto em minutos!
        </p>
      </FadeUp>
    </section>
  );
}

/* ─── Footer ──────────────────────────────────────────────────── */

const FOOTER_COLS = [
  { title: 'Produto', links: [
    { label: 'Como funciona', href: '#como-funciona' },
    { label: 'Recursos', href: '#recursos' },
    { label: 'Planos', href: '#planos' },
  ]},
  { title: 'Suporte', links: [
    { label: 'FAQ', href: '#faq' },
    { label: 'Suporte', href: '#faq' },
    { label: 'Ativar acesso', href: '/login' },
  ]},
  { title: 'Legal', links: [
    { label: 'Termos de uso', href: '/termos' },
    { label: 'Privacidade', href: '/privacidade' },
    { label: 'Reembolso', href: '/reembolso' },
  ]},
];

function Footer() {
  return (
    <footer className="relative overflow-hidden p-16" style={{ background: 'var(--lp-band)' }}>
        {/* Watermark */}
        <span
          aria-hidden
          className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/3 font-bold select-none pointer-events-none whitespace-nowrap"
          style={{ fontSize: '27vw', letterSpacing: '-0.05em', color: '#DEDEDA', lineHeight: 1 }}
        >
          creatools
        </span>

        <div
          className="relative z-10 max-w-5xl mx-auto rounded-[32px] bg-white p-8 md:p-12 border border-[#CCCCCC]"
          style={{ boxShadow: '0 24px 80px -24px rgba(0,0,0,0.27)' }}
        >
          <div className="grid md:grid-cols-[1.3fr_1fr_1fr_1fr] gap-10">
            <div>
              <div className="flex items-center gap-2.5">
                {/* Mesmo caso da navbar: o arquivo é 7644×2144 (~3.57:1) e estava
                    num quadrado 134×134, então `object-contain` encaixava a marca
                    e o resto da caixa era ar — 96px de altura morta empurrando o
                    texto abaixo. Agora a caixa TEM a proporção da marca. */}
                <Image src="/LOGO_SEMFUNDO.png" alt="Creatools" width={161} height={45} className="object-contain h-auto w-[161px]" />
              </div>
              <p className="mt-3 text-[14px] leading-relaxed max-w-[220px]" style={{ color: 'var(--lp-gray)' }}>
                IA para creators que levam conteúdo a sério.
              </p>
            </div>
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <p className="text-[14.5px] font-bold">{col.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a href={l.href} className="text-[13.5px] hover:text-black transition-colors" style={{ color: 'var(--lp-gray)' }}>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 pt-6" style={{ borderTop: '1px solid var(--lp-line)' }}>
            <p className="text-[13px]" style={{ color: 'var(--lp-gray)' }}>© 2026 Creatools. Todos os direitos reservados.</p>
          </div>
        </div>
    </footer>
  );
}

/* ─── Page ────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="lp min-h-screen">
      <style>{LP_CSS}</style>
      <Nav />
      <Hero />
      <Truth />
      <HowItWorks />
      <ParallaxGallery />
      <Features />
      <Marquee />
      <Results />
      <PeopleWhoUse />
      <DoTheMath />
      <Pricing />
      <Faq />
      <FinalCTA />
      <Footer />
    </div>
  );
}
