'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { startStripeCheckout } from '@/lib/start-checkout';
import { ShootingStarsGrid } from '@/components/ui/shooting-stars-grid';
import { ChevronRight, Plus, X, Heart, MessageCircle, Repeat2 } from 'lucide-react';

/* ────────────────────────────────────────────────────────────────
   CREATOOLS · LANDING PAGE
   Visual: Figma "LANDING PAGE - CREATOOLS" — branco/preto, pills,
   sombra offset nos CTAs, seções dark de contraste.
   Copy: COPY - CREATOOLS.md
   ──────────────────────────────────────────────────────────────── */

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
  const links = [
    { href: '#recursos', label: 'Recursos' },
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#planos', label: 'Planos' },
    { href: '#faq', label: 'FAQ' },
  ];
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="absolute top-0 left-0 right-0 z-50"
    >
      <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/LOGO_SEMFUNDO.png" alt="Creatools" width={30} height={30} className="object-contain" />
          <span className="font-bold text-[17px] tracking-tight">creatools</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-[14.5px] font-medium" style={{ color: 'var(--lp-gray-2)' }}>
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-black transition-colors">{l.label}</a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="lp-btn light !py-[13px] !px-6 text-[14px]">Login</Link>
          <Link href="/cadastro" className="lp-btn black !text-[14px] !pl-5 !py-[7px]">
            Começar agora <ArrowChip dark />
          </Link>
        </div>
      </div>
    </motion.header>
  );
}

/* ─── Hero ────────────────────────────────────────────────────── */

const HERO_IMAGES = [1, 3].flatMap((c) =>
  [1, 2, 3, 4, 5].map((s) => `/cards_para_hero/carrossel-${c}/carrossel-${c}---${s}.png`)
);

const HERO_ITEM_W = 230;
const HERO_ITEM_H = 288;
const HERO_GAP = 10;
const HERO_MAIN_GAP = 3;
const HERO_STEP = HERO_ITEM_W + HERO_GAP;
const HERO_MAIN_SCALE = 1.34;
const HERO_INTERVAL_MS = 3000;
// Odd count, centered on the main card. Wide enough that cards mount/unmount
// beyond the viewport edge — a freshly mounted card appears at its final slot
// with no transition, so if that happened on-screen it would overlap the card
// still sliding out of that slot (the "stacked cards" glitch).
const HERO_WINDOW = 15;

// Distance from center for a given slot: slot 0 is the main (scaled-up) card,
// so its neighbors (±1) need extra room to keep a real gap instead of
// overlapping into the bigger card; farther slots then space out normally.
function heroSlotX(slot: number) {
  if (slot === 0) return 0;
  const mainHalf = (HERO_ITEM_W * HERO_MAIN_SCALE) / 2;
  const baseHalf = HERO_ITEM_W / 2;
  const firstNeighbor = mainHalf + HERO_MAIN_GAP + baseHalf;
  const dist = firstNeighbor + (Math.abs(slot) - 1) * HERO_STEP;
  return slot > 0 ? dist : -dist;
}

function HeroCarousel() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), HERO_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const n = HERO_IMAGES.length;
  const half = Math.floor(HERO_WINDOW / 2);

  const renderedItems = Array.from({ length: HERO_WINDOW }, (_, idx) => {
    const k = step - half + idx;
    const imgIndex = ((k % n) + n) % n;
    return { k, src: HERO_IMAGES[imgIndex] };
  });

  // Edge fade measured in px from the center, not % of the viewport: stays
  // fully opaque through the two side cards (±1), then fades out across the
  // first half of the ±2 cards — main + 2 whole cards + 2 half cards visible.
  const maskSolid = heroSlotX(1) + HERO_ITEM_W / 2;
  const maskEnd = heroSlotX(2) + HERO_ITEM_W * 0.34;
  const heroMask = `linear-gradient(90deg, transparent calc(50% - ${maskEnd}px), #000 calc(50% - ${maskSolid}px), #000 calc(50% + ${maskSolid}px), transparent calc(50% + ${maskEnd}px))`;

  return (
    <div className="relative w-full overflow-x-hidden" style={{ height: HERO_ITEM_H * HERO_MAIN_SCALE + 256 }}>
      <div
        className="absolute inset-0"
        style={{
          maskImage: heroMask,
          WebkitMaskImage: heroMask,
        }}
      >
        {renderedItems.map((item) => {
          // Content advances right → left: as `step` grows, each card's slot
          // decreases, so the current main card (slot 0) drifts left and the
          // next one (slot +1) slides in from the right to take its place.
          const slot = item.k - step;
          const isMain = slot === 0;
          const scale = isMain ? HERO_MAIN_SCALE : 1;
          return (
            <div
              key={item.k}
              className="absolute top-1/2 left-1/2 rounded-[20px] overflow-hidden"
              style={{
                width: HERO_ITEM_W,
                height: HERO_ITEM_H,
                marginTop: -HERO_ITEM_H / 2,
                marginLeft: -HERO_ITEM_W / 2,
                transform: `translateX(${heroSlotX(slot)}px) scale(${scale})`,
                transition: 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 900ms cubic-bezier(0.22, 1, 0.36, 1)',
                zIndex: isMain ? 20 : 10,
                background: '#0B0B0B',
                border: '4px solid #161616',
                boxShadow: isMain
                  ? '0 32px 70px -20px rgba(0,0,0,0.55)'
                  : '0 14px 28px -14px rgba(0,0,0,0.25)',
              }}
            >
              <Image src={item.src} alt="" fill sizes="310px" className="object-cover" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <ShootingStarsGrid
      className="min-h-0 rounded-none border-0 shadow-none !bg-none !bg-white"
      contentClassName="block min-h-0 px-0 py-0 sm:px-0 pt-32 md:pt-36 pb-14"
      glow={false}
    >
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="lp-h tracking-tighter"
          style={{ fontSize: 'clamp(38px, 5.4vw, 64px)' }}
        >
          <span style={{ color: 'var(--lp-gray)' }}>Seu conteúdo do Instagram</span>
          <br />
          pronto em minutos, não em horas.
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
          <a href="#planos" className="lp-btn black">
            Quero criar meu primeiro carrossel <ArrowChip dark />
          </a>
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
        className="relative mt-4 md:mt-6"
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
        <FadeUp>
          <div
            className="aspect-square rounded-[32px] p-8 md:p-12 flex flex-col justify-between"
            style={{ background: 'var(--lp-black)', color: '#fff' }}
          >
            <div className="flex items-center gap-2 text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <span className="w-2 h-2 rounded-full bg-white/60" /> @mosseri
            </div>
            <p className="lp-h" style={{ fontSize: 'clamp(24px, 2.8vw, 36px)' }}>
              “O algoritmo entrega carrosséis mais do que qualquer outro formato.”
            </p>
            <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}>Adam Mosseri · CEO do Instagram</p>
          </div>
        </FadeUp>

        <FadeUp delay={0.12}>
          <span className="lp-badge" style={{ background: '#fff', color: 'var(--lp-black)' }}>A verdade que ninguém te conta</span>
          <h2 className="lp-h tracking-tighter mt-6" style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>
            Aqui está a verdade <span style={{ color: 'var(--lp-gray)' }}>brutal</span>
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
    desc: 'Digite uma frase simples, como “5 erros de quem começa a treinar”, e escolha o estilo: editorial, minimalista ou thread do X.',
  },
  {
    title: 'A IA monta tudo',
    desc: 'Texto persuasivo, layout, tipografia e as cores da sua marca. Em segundos o carrossel completo aparece no editor.',
  },
  {
    title: 'Exporte e publique',
    desc: 'Baixe em Full HD (PNG ou ZIP), agende no calendário e publique direto no seu perfil.',
  },
];

function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 md:py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto text-center">
        <FadeUp>
          <span className="lp-badge outline">Em 3 passos</span>
          <h2 className="lp-h tracking-tighter mt-6" style={{ fontSize: 'clamp(34px, 4.4vw, 54px)' }}>Tão simples que parece mágica</h2>
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
      <div className="h-28" style={{ background: 'linear-gradient(135deg, #1a1a1a, #3a3a38)' }} />
      <div className="p-4 bg-white">
        <span className="inline-block text-[9px] font-bold tracking-[0.16em] uppercase px-2 py-1 rounded bg-red-600 text-white">Notícia</span>
        <p className="text-[14px] font-bold tracking-tight mt-2 leading-snug">IA generativa muda o jogo do marketing em 2026</p>
        <p className="text-[10px] mt-2" style={{ color: '#9A9A96' }}>Gerado em segundos · 1080×1350</p>
      </div>
    </div>
  );
}

function MockTemplates() {
  const pairs = [
    ['SF Display', 'IvyOra'],
    ['Space Grotesk', 'Inter'],
    ['Playfair', 'Lato'],
    ['Bebas', 'Inter'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-[260px]">
      {pairs.map(([a, b], i) => (
        <div key={i} className="rounded-2xl p-4 bg-white text-left" style={{ border: '1px solid #ECECEA' }}>
          <p style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: '#0A0A0A' }}>Aa</p>
          <p className="text-[10px] mt-2" style={{ color: '#9A9A96' }}>{a} · {b}</p>
        </div>
      ))}
    </div>
  );
}

function MockAgenda() {
  const scheduled = [3, 7, 10, 14, 17, 21, 24, 27];
  return (
    <div className="w-full max-w-[260px] rounded-2xl bg-white p-5 text-left" style={{ border: '1px solid #ECECEA' }}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold">Julho 2026</p>
        <p className="text-[10px]" style={{ color: '#9A9A96' }}>8 posts</p>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mt-4">
        {Array.from({ length: 28 }, (_, i) => (
          <div
            key={i}
            className="aspect-square rounded-md grid place-items-center text-[8px]"
            style={{ background: scheduled.includes(i) ? '#0A0A0A' : '#F4F4F2', color: scheduled.includes(i) ? '#fff' : '#B5B5B0' }}
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
      <div className="flex gap-2.5 mt-4">
        {colors.map((c) => (
          <div key={c} className="w-9 h-9 rounded-full" style={{ background: c, border: '1px solid #ECECEA' }} />
        ))}
      </div>
      <p className="text-[10px] mt-4" style={{ color: '#9A9A96' }}>Aplicada automaticamente em cada geração</p>
    </div>
  );
}

function MockAiImages() {
  return (
    <div className="w-full max-w-[240px] text-left">
      <div className="aspect-[4/5] rounded-2xl" style={{ background: 'conic-gradient(from 210deg at 50% 40%, #232323, #4a4a46, #17171a, #2e2e2a, #232323)' }} />
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: '#9A9A96' }}>OpenAI · gpt-image-2</span>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#0A0A0A', color: '#fff' }}>5 créditos</span>
      </div>
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
      '3 estilos prontos: Editorial, Minimalista e Thread do X',
      'Gancho, desenvolvimento e CTA escritos pela IA',
      'Editor visual completo pra ajustar tudo antes de exportar',
    ],
    visual: <MockCarousel />,
  },
  {
    tab: 'Notícias',
    tag: 'Poste o assunto do momento',
    title: (<>Transforme notícias em posts <span style={{ color: '#8B8B87' }}>antes de todo mundo</span></>),
    body: 'Notícia quente do seu nicho vira news card pronto pra publicar em segundos. Formato jornalístico que passa autoridade e pega o alcance de quem publica primeiro.',
    bullets: [
      'Card no formato ideal do feed (1080×1350)',
      'Manchete, resumo e imagem montados pela IA',
      'Edite qualquer texto antes de exportar',
    ],
    visual: <MockNews />,
  },
  {
    tab: 'Templates',
    tag: 'Escala com padrão',
    title: (<>Estilos prontos, <span style={{ color: '#8B8B87' }}>identidade sempre igual</span></>),
    body: 'Escolha entre os estilos do Creatools e 7 combinações profissionais de tipografia. Todo post sai com a mesma cara: consistência visual de quem está crescendo de verdade.',
    bullets: [
      'Editorial, Minimalista e formato thread do X',
      '7 pares de fontes calibrados por designers',
      'Mesmo padrão em todos os posts, sem esforço',
    ],
    visual: <MockTemplates />,
  },
  {
    tab: 'Agenda de conteúdo',
    tag: 'Nunca mais sem postar',
    title: (<>Seu mês inteiro organizado <span style={{ color: '#8B8B87' }}>num calendário</span></>),
    body: 'Planeje carrosséis e news cards num único calendário. Clique no dia, agende o post, veja o mês inteiro de uma vez. Acabou o “o que eu posto hoje?”.',
    bullets: [
      'Visão do mês com todos os posts planejados',
      'Agende em qualquer dia com um clique',
      'Carrosséis e news cards no mesmo lugar',
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
    body: 'Gere imagens exclusivas pros seus slides com o gpt-image-2, o modelo de imagem mais recente da OpenAI. Cada imagem custa 5 créditos do seu plano.',
    bullets: [
      'Motor de imagem OpenAI gpt-image-2',
      'Imagem sob medida pro contexto do slide',
      '5 créditos por imagem gerada',
    ],
    visual: <MockAiImages />,
  },
];

function Features() {
  const [active, setActive] = useState(2);
  const f = FEATURES[active];

  return (
    <section id="recursos" className="py-16 md:py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center">
          <span className="lp-badge outline">Vários recursos exclusivos</span>
          <h2 className="lp-h tracking-tighter mt-6" style={{ fontSize: 'clamp(34px, 4.4vw, 54px)' }}>
            Tudo que você precisa pra
            <br />
            <span style={{ color: 'var(--lp-gray)' }}>crescer no Instagram</span>
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
                onClick={() => setActive(i)}
                className="relative px-4 md:px-5 py-2.5 rounded-full text-[11.5px] md:text-[12.5px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: i === active ? '#fff' : 'var(--lp-gray-2)', transition: 'color 250ms ease' }}
              >
                {i === active && (
                  <motion.span
                    layoutId="feature-tab-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--lp-black)' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative z-10">{feat.tab}</span>
              </button>
            ))}
          </div>
        </FadeUp>

        {/* Feature card */}
        <FadeUp delay={0.15} className="mt-8">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[36px] p-8 md:p-14 grid md:grid-cols-[1.1fr_0.9fr] gap-10 items-center"
            style={{ background: 'var(--lp-black)', color: '#fff' }}
          >
            <div>
              <span className="lp-badge on-dark">{f.tag}</span>
              <h3 className="lp-h mt-6" style={{ fontSize: 'clamp(28px, 3.4vw, 44px)' }}>{f.title}</h3>
              <p className="mt-5 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{f.body}</p>
              <ul className="mt-6 space-y-2.5">
                {f.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[14.5px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-white/50 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[24px] bg-white min-h-[360px] md:min-h-[420px] grid place-items-center p-8">
              {f.visual}
            </div>
          </motion.div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ─── Marquee ─────────────────────────────────────────────────── */

const MARQUEE_ITEMS = [
  { ring: '#B5B5B0', emoji: '🧴' },
  { ring: '#3B82F6', emoji: '💧' },
  { ring: '#65A30D', emoji: '🌿' },
  { ring: '#EA580C', emoji: '🍊' },
  { ring: '#EC4899', emoji: '💗' },
  { ring: '#8B5CF6', emoji: '💜' },
  { ring: '#CA8A04', emoji: '✨' },
  { ring: '#EF4444', emoji: '🍒' },
];

function Marquee() {
  // The keyframe slides the track by -50%, so the track must hold an even
  // number of item sets AND its half-width must exceed the widest viewport —
  // otherwise the strip runs out of content and the right side shows blank.
  const items = Array.from({ length: 8 }, () => MARQUEE_ITEMS).flat();
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
            <div
              className="w-20 h-20 rounded-full grid place-items-center text-[40px] bg-white"
              style={{ border: `3px solid ${item.ring}` }}
            >
              {item.emoji}
            </div>
            <span className="text-[13px]" style={{ color: 'var(--lp-gray)' }}>@orafaelrocha_</span>
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
          <h2 className="lp-h tracking-tighter mt-6 max-w-3xl mx-auto" style={{ fontSize: 'clamp(30px, 3.8vw, 48px)' }}>
            Veja o tipo de post que você vai criar <span style={{ color: 'var(--lp-gray)' }}>com o Creatools</span>
          </h2>
          <p className="mt-4 text-[16px]" style={{ color: 'var(--lp-gray)' }}>
            Carrosséis e news cards gerados dentro da plataforma. Sem Canva, sem Photoshop, sem designer.
          </p>
        </FadeUp>

        <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {/* Editorial */}
          <FadeUp delay={0}>
            <div className="aspect-[4/5] rounded-[20px] p-6 flex flex-col justify-between text-left" style={{ background: '#0A0A0A', color: '#fff' }}>
              <span className="text-[9px] font-semibold tracking-[0.2em] uppercase opacity-45">Editorial</span>
              <p className="lp-h text-[19px] md:text-[22px]">5 erros que travam seu crescimento</p>
              <span className="text-[10px] opacity-35">@orafaelrocha_</span>
            </div>
          </FadeUp>
          {/* Minimalista */}
          <FadeUp delay={0.07}>
            <div className="aspect-[4/5] rounded-[20px] p-6 flex flex-col justify-between text-left" style={{ background: '#F4F3EF' }}>
              <span className="text-[9px] font-semibold tracking-[0.2em] uppercase" style={{ color: '#B5B5B0' }}>Minimalista</span>
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
          <h2 className="lp-h tracking-tighter mt-6 text-white" style={{ fontSize: 'clamp(32px, 4.2vw, 52px)' }}>
            Quanto você pagaria <span style={{ color: '#6E6E6A' }}>separado</span>
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

const PLAN_FEATURES = [
  'Carrosséis completos com IA (texto + layout + design)',
  '3 estilos: Editorial, Minimalista e Thread do X',
  'News cards: notícia vira post em segundos',
  'Imagens com IA (OpenAI gpt-image-2): 5 créditos cada',
  'Editor visual slide a slide',
  'Agenda de conteúdo',
  'Export Full HD (PNG e ZIP)',
];

function Pricing() {
  const [loadingInterval, setLoadingInterval] = useState<'month' | 'year' | null>(null);

  async function handleSubscribe(interval: 'month' | 'year') {
    setLoadingInterval(interval);
    try {
      await startStripeCheckout(interval, { nextPath: '/#planos' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar checkout');
      setLoadingInterval(null);
    }
  }

  return (
    <section id="planos" className="py-12 md:py-16 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center">
          <span className="lp-badge soft">Comece agora</span>
          <h2 className="lp-h tracking-tighter mt-6" style={{ fontSize: 'clamp(34px, 4.4vw, 54px)' }}>
            Escolha a melhor opção
            <br />
            <span style={{ color: 'var(--lp-gray)' }}>para começar</span>
          </h2>
          <p className="mt-4 text-[16px]" style={{ color: 'var(--lp-gray)' }}>
            Checkout seguro (Stripe). Sem fidelidade. Cancele quando quiser.
          </p>
        </FadeUp>

        <div className="mt-14 grid md:grid-cols-2 gap-6 max-w-3xl mx-auto items-start">
          {/* Mensal */}
          <FadeUp>
            <div className="rounded-[28px] p-8" style={{ background: 'var(--lp-band)' }}>
              <span className="lp-badge" style={{ background: 'var(--lp-black)', color: '#fff', fontSize: 11, padding: '7px 14px' }}>
                Plano Mensal
              </span>
              <div className="mt-5 flex items-baseline">
                <span className="lp-h" style={{ fontSize: 56 }}>R$59</span>
                <span className="text-[22px] font-bold" style={{ color: 'var(--lp-gray)' }}>,50</span>
                <span className="ml-2 text-[14px]" style={{ color: 'var(--lp-gray)' }}>/mês</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'var(--lp-gray-2)' }}>
                Cobrado mês a mês. Sem fidelidade.
                <br />Equivale a ~R$1,98/dia
              </p>
              <div className="mt-6 -mx-8 px-8 py-3" style={{ background: '#EBEBE9' }}>
                <p className="text-[13px] font-bold tracking-tight">200 CRÉDITOS TODO MÊS</p>
                <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--lp-gray-2)' }}>Até 40 carrosséis ou 66 news cards</p>
              </div>
              <ul className="mt-6 space-y-2.5">
                {PLAN_FEATURES.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: 'var(--lp-gray-2)' }}>
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#C5C5C0' }} />
                    {perk}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleSubscribe('month')}
                disabled={loadingInterval !== null}
                className="lp-btn white w-full justify-between mt-8 !bg-white !rounded-full"
              >
                {loadingInterval === 'month' ? 'Abrindo checkout…' : 'Assinar Plano Mensal'} <ArrowChip />
              </button>
            </div>
          </FadeUp>

          {/* Anual */}
          <FadeUp delay={0.1}>
            <div
              className="rounded-[28px] p-8 relative"
              style={{ background: 'var(--lp-black)', color: '#fff', boxShadow: '0 0 0 2px #fff, 10px 10px 0 0 var(--lp-black)' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="lp-badge" style={{ background: '#fff', color: 'var(--lp-black)', fontSize: 11, padding: '7px 14px' }}>
                  Plano Anual
                </span>
                <span className="lp-badge" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '7px 14px' }}>
                  3 meses grátis
                </span>
              </div>
              <div className="mt-5 flex items-baseline">
                <span className="lp-h" style={{ fontSize: 56 }}>R$499</span>
                <span className="ml-2 text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>/ano</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Equivale a ~R$41,58/mês. Economize ~30%.
                <br />O plano mais escolhido.
              </p>
              <div className="mt-6 -mx-8 px-8 py-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <p className="text-[13px] font-bold tracking-tight">300 CRÉDITOS TODO MÊS</p>
                <p className="text-[11.5px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Até 60 carrosséis ou 100 news cards</p>
              </div>
              <ul className="mt-6 space-y-2.5">
                {PLAN_FEATURES.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                    {perk}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleSubscribe('year')}
                disabled={loadingInterval !== null}
                className="lp-btn white w-full justify-between mt-8 !rounded-full"
              >
                {loadingInterval === 'year' ? 'Abrindo checkout…' : 'Assinar Plano Anual'} <ArrowChip solid />
              </button>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.15}>
          <p className="mt-12 text-center text-[13.5px]" style={{ color: 'var(--lp-gray)' }}>
            Precisa de ajuda? Fale com nosso suporte. Respondemos rápido.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}

/* ─── FAQ ─────────────────────────────────────────────────────── */

const FAQS = [
  {
    q: 'Preciso saber design?',
    a: 'Não. A IA escreve o texto, escolhe o layout e aplica as cores da sua marca. Você só digita o tema e, se quiser, ajusta qualquer detalhe no editor visual antes de exportar.',
  },
  {
    q: 'Como funcionam os créditos?',
    a: 'Cada plano vem com créditos mensais que renovam automaticamente (200 no mensal, 300 no anual). Um carrossel completo custa 5 créditos, um news card custa 3, e cada imagem gerada com IA custa 5.',
  },
  {
    q: 'Quantos posts posso criar por mês?',
    a: 'Com o plano mensal, até 40 carrosséis ou 66 news cards por mês (ou uma combinação dos dois). No anual, até 60 carrosséis ou 100 news cards. Pra quem posta todo dia, sobra crédito.',
  },
  {
    q: 'Funciona para qualquer nicho?',
    a: 'Sim. Marketing, fitness, nutrição, finanças, moda, educação, coaching: você define o tema e o tom, e a IA adapta o conteúdo ao seu nicho.',
  },
  {
    q: 'O Creatools publica automaticamente no Instagram?',
    a: 'O Creatools cria, organiza e agenda seus posts no calendário. A publicação você faz direto no Instagram com o arquivo exportado em Full HD, sem conectar sua conta a ferramentas de terceiros e sem risco pro seu perfil.',
  },
  {
    q: 'Como funciona a geração de imagens com IA?',
    a: 'Cada imagem é gerada sob medida pro seu slide com o gpt-image-2 da OpenAI e custa 5 créditos do seu plano, o mesmo saldo que carrossel e news card usam.',
  },
  {
    q: 'Preciso de ajuda com minha assinatura, como faço?',
    a: 'Você gerencia tudo pelo portal de assinatura dentro da plataforma: trocar de plano, atualizar cartão ou cancelar. E nosso suporte responde rápido pra qualquer dúvida.',
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
          <h2 className="lp-h tracking-tighter mt-6" style={{ fontSize: 'clamp(34px, 4.4vw, 54px)' }}>
            Perguntas <span style={{ color: 'var(--lp-gray)' }}>frequentes</span>
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
        <h2 className="lp-h tracking-tighter" style={{ fontSize: 'clamp(34px, 4.4vw, 54px)' }}>
          Comece a publicar com
          <br />
          <span style={{ color: 'var(--lp-gray)' }}>consistência de verdade</span>
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
    { label: 'Termos de uso', href: '#' },
    { label: 'Privacidade', href: '#' },
    { label: 'Reembolso', href: '#' },
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
                <Image src="/LOGO_SEMFUNDO.png" alt="Creatools" width={134} height={134} className="object-contain" />
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
      <Features />
      <Marquee />
      <Results />
      <DoTheMath />
      <Pricing />
      <Faq />
      <FinalCTA />
      <Footer />
    </div>
  );
}
