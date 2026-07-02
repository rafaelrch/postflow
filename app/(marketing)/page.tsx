'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { startStripeCheckout } from '@/lib/start-checkout';
import {
  Sparkles, Download, ArrowRight, Check, X,
  ChevronDown, Star, LayoutTemplate, Type, Image as ImageIcon,
  Calendar, Newspaper, MessageSquareText,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.6, ease: 'easeOut', delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
      style={{
        background: 'color-mix(in srgb, var(--paper) 85%, transparent)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <Link href="/" className="flex items-center gap-3">
        <span className="brand-mark">
          <Image src="/LOGO_SEMFUNDO.png" alt="Creatools" width={32} height={32} className="object-contain" style={{ filter: 'invert(1)' }} />
        </span>
        <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--ink)' }}>
          creatools
        </span>
      </Link>

      <nav className="hidden md:flex items-center gap-6 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
        <a href="#features" className="hover:opacity-70 transition-opacity">Ferramentas</a>
        <a href="#how" className="hover:opacity-70 transition-opacity">Como funciona</a>
        <a href="#pricing" className="hover:opacity-70 transition-opacity">Preços</a>
      </nav>

      <Link href="/dashboard" className="brand-btn primary">
        Começar grátis <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </motion.header>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 pt-24 grid-bg"
      style={{ background: 'var(--paper)' }}
    >
      <motion.div style={{ y, opacity }} className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
        {/* Kicker */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 chip"
          style={{ borderRadius: 999, padding: '6px 12px', background: 'var(--paper)' }}
        >
          <span className="dot-live" aria-hidden />
          IA treinada para conteúdo viral
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className="font-display leading-[0.92] mb-6"
          style={{
            fontSize: 'clamp(56px, 8vw, 120px)',
            letterSpacing: '-0.035em',
            color: 'var(--ink)',
          }}
        >
          Criativo no piloto <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>automático.</span>
          <br />
          <span style={{ color: 'var(--ink-dim)' }}>Postagem todo dia.</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
          className="text-[17px] md:text-[19px] leading-relaxed max-w-xl mb-10"
          style={{ color: 'var(--ink-dim)' }}
        >
          Creatools junta <b style={{ color: 'var(--ink)' }}>carrossel</b>, <b style={{ color: 'var(--ink)' }}>tweet</b>, <b style={{ color: 'var(--ink)' }}>news card</b> e <b style={{ color: 'var(--ink)' }}>agenda</b> num só estúdio. A IA escreve e desenha. Você só aprova.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          <Link href="/dashboard" className="brand-btn primary" style={{ padding: '14px 22px', fontSize: 14 }}>
            Abrir o estúdio
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="#how" className="brand-btn outline" style={{ padding: '14px 22px', fontSize: 14 }}>
            Ver como funciona
          </Link>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-10 flex items-center gap-3"
        >
          <div className="flex -space-x-2">
            {['#0a0a0a', '#2a2a27', '#6f6e68', '#a8a69c', '#e2dfd4'].map((bg, i) => (
              <div key={i} className="w-7 h-7 rounded-full" style={{ background: bg, border: '2px solid var(--paper)' }} />
            ))}
          </div>
          <p className="text-[12px]" style={{ color: 'var(--ink-dim)' }}>
            Usado por <span className="font-medium" style={{ color: 'var(--ink)' }}>+2.000 creators</span>
          </p>
        </motion.div>
      </motion.div>

      {/* Preview cards */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.8 }}
        className="relative z-10 mt-16 w-full max-w-4xl mx-auto"
      >
        <PreviewCards />
      </motion.div>

      {/* Scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
        style={{ color: 'var(--ink-muted)' }}
      >
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}>
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.div>
    </section>
  );
}

function PreviewCards() {
  const slides = [
    { label: 'CARROSSEL', title: '5 erros que te impedem de vender no Instagram', bg: '#0A0A0A', fg: '#FAFAF7' },
    { label: 'TWEET',     title: 'Descobri o que realmente prende atenção em 3s.', bg: '#E4572E', fg: '#FFFFFF' },
    { label: 'NEWS',      title: 'OpenAI capta US$ 122 bi — mercado reage em horas', bg: '#FAFAF7', fg: '#0A0A0A' },
  ];

  return (
    <div className="relative h-60 flex items-end justify-center gap-6">
      {slides.map((s, i) => {
        const rotations = [-5, 0, 5];
        const ys = [14, 0, 14];
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: ys[i] }}
            transition={{ duration: 0.8, delay: 0.9 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: ys[i] - 8, rotate: 0, zIndex: 20, transition: { duration: 0.3 } }}
            style={{ rotate: rotations[i], zIndex: i === 1 ? 10 : 1 }}
            className="w-40 h-52 overflow-hidden cursor-pointer rounded-[14px]"
          >
            <div
              className="w-full h-full p-4 flex flex-col justify-between"
              style={{
                background: s.bg,
                color: s.fg,
                border: '1.5px solid var(--ink)',
                boxShadow: 'var(--sh-3)',
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.2em]"
                  style={{ color: s.fg, opacity: 0.7 }}
                >
                  {s.label}
                </span>
                <span className="w-2 h-2 rounded-full" style={{ background: s.fg }} />
              </div>
              <p className="font-display text-[16px] leading-[1.1]">{s.title}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Truth section ────────────────────────────────────────────────────────────

function TruthSection() {
  return (
    <section className="py-20 px-4" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
      <div className="max-w-5xl mx-auto">
        <FadeUp>
          <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase mb-4" style={{ color: 'var(--ink-muted)' }}>
            A verdade que ninguém conta
          </p>
          <h2 className="font-display leading-[0.95] mb-8" style={{ fontSize: 'clamp(36px, 5vw, 60px)', letterSpacing: '-0.025em' }}>
            O algoritmo prioriza quem posta todo dia.
            <br />
            <span style={{ opacity: 0.5 }}>Quem improvisa, some.</span>
          </h2>
        </FadeUp>
        <div className="grid md:grid-cols-3 gap-5 mt-12">
          {[
            { stat: '3h', label: 'tempo médio gasto no Canva por carrossel' },
            { stat: '10×', label: 'mais rápido com IA calibrada para virais' },
            { stat: '#1', label: 'formato com mais alcance orgânico em 2026' },
          ].map((item, i) => (
            <FadeUp key={i} delay={i * 0.1}>
              <div
                className="rounded-[14px] p-6"
                style={{
                  border: '1.5px solid var(--paper)',
                  background: 'var(--ink-2)',
                  boxShadow: '4px 4px 0 0 var(--paper)',
                }}
              >
                <p className="font-display" style={{ fontSize: 56, lineHeight: 1 }}>{item.stat}</p>
                <p className="text-[13px] leading-snug mt-3" style={{ opacity: 0.7 }}>{item.label}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How it works ────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { n: '01', title: 'Descreva seu conteúdo',  desc: 'Digite o tema, nicho ou notícia. Uma frase como “5 dicas de marketing” já basta.', icon: Type },
    { n: '02', title: 'A IA cria tudo',          desc: 'Texto, layout, thread e card de notícia gerados em segundos no seu tom.',         icon: Sparkles },
    { n: '03', title: 'Agende e publique',       desc: 'Solte na agenda. O Creatools lembra quando é hora de postar e exporta em Full HD.', icon: Calendar },
  ];

  return (
    <section id="how" className="py-24 px-4 grid-bg" style={{ background: 'var(--paper-2)' }}>
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-16">
          <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase mb-3" style={{ color: 'var(--ink-dim)' }}>
            Como funciona
          </p>
          <h2 className="font-display" style={{ fontSize: 'clamp(36px, 5vw, 60px)', letterSpacing: '-0.025em', color: 'var(--ink)' }}>
            Simples <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>assustadoramente</span> rápido
          </h2>
        </FadeUp>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <FadeUp key={i} delay={i * 0.15}>
                <div className="brand-card p-6 h-full flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="brand-mark sm">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>{step.n}</span>
                  </div>
                  <h3 className="font-display text-[26px] leading-[1.1]" style={{ color: 'var(--ink)' }}>{step.title}</h3>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-dim)' }}>{step.desc}</p>
                </div>
              </FadeUp>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Features ────────────────────────────────────────────────────────────────

function Features() {
  const features = [
    { icon: Sparkles,          title: 'Carrosséis por IA',         desc: 'Diga o tema e tom. A IA monta slides prontos pra publicar.' },
    { icon: MessageSquareText, title: 'Threads e tweets autorais', desc: 'Documente o que você constrói. A IA propõe 3 versões no seu tom.' },
    { icon: Newspaper,         title: 'News Cards editorial',      desc: 'Transforme manchetes em cards editoriais com gradient e foto.' },
    { icon: Calendar,          title: 'Agenda de postagem',        desc: 'Calendário visual: agende, mova e mantenha ritmo diário.' },
    { icon: LayoutTemplate,    title: 'Editor visual simples',     desc: 'Ajuste cores, fontes, imagem, espaçamento. Sem Canva.' },
    { icon: Download,          title: 'Export Full HD',            desc: 'PNG 1080px e ZIP do carrossel inteiro com um clique.' },
    { icon: Type,              title: 'Copy pronta',               desc: 'Títulos, ganchos e copy dos slides sugeridos pela IA.' },
    { icon: ImageIcon,         title: 'Imagens com fator viral',   desc: 'Fluxo calibrado para gerar imagens que se destacam no feed.' },
  ];

  return (
    <section id="features" className="py-24 px-4" style={{ background: 'var(--paper)' }}>
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center mb-16">
          <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase mb-3" style={{ color: 'var(--ink-dim)' }}>
            Tudo num só estúdio
          </p>
          <h2 className="font-display" style={{ fontSize: 'clamp(36px, 5vw, 60px)', letterSpacing: '-0.025em', color: 'var(--ink)' }}>
            Um software. <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>Tudo</span> que você posta.
          </h2>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <FadeUp key={i} delay={i * 0.06}>
                <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.25 }} className="brand-card p-5 h-full flex flex-col gap-3">
                  <span className="brand-mark sm">
                    <Icon className="w-4 h-4" />
                  </span>
                  <h3 className="font-display text-[20px] leading-[1.15]" style={{ color: 'var(--ink)' }}>{f.title}</h3>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-dim)' }}>{f.desc}</p>
                </motion.div>
              </FadeUp>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ────────────────────────────────────────────────────────────

function Testimonials() {
  const testimonials = [
    { name: 'Camila Alves',     role: 'Marketing B2B',  quote: 'Carrossel de funil bateu +48% de salvamentos vs. o resto do feed — sem fim de semana no Canva.' },
    { name: 'Rafael Santos',    role: 'Infoprodutor',   quote: 'Lead perguntou qual agência fez o layout. Era eu no Creatools. Na terça fechou consultoria.' },
    { name: 'Juliana Menezes',  role: 'Mentora',        quote: 'Agora o carrossel da semana sai no domingo — só adapto o gancho pro Reels.' },
    { name: 'Lucas Pereira',    role: 'Fitness',        quote: 'Testei o gancho que a IA sugeriu: salvamentos 4% → 11%. Não foi sorte.' },
    { name: 'Bianca Ferreira',  role: 'Estética',       quote: 'Mesmo template, skincare e contador — só troco paleta. Parecia rebranding.' },
    { name: 'Diego Rocha',      role: 'Consultor',      quote: 'DMs com “quanto custa?” triplicaram. Coincidiu com Creatools. Não é viralidade aleatória.' },
  ];

  return (
    <section className="py-24 px-4" style={{ background: 'var(--paper-2)' }}>
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center mb-16">
          <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase mb-3" style={{ color: 'var(--ink-dim)' }}>
            Depoimentos
          </p>
          <h2 className="font-display" style={{ fontSize: 'clamp(36px, 5vw, 60px)', letterSpacing: '-0.025em', color: 'var(--ink)' }}>
            Creators que publicam<br />
            <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>sem travar</span>
          </h2>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <FadeUp key={i} delay={i * 0.07}>
              <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.25 }} className="brand-card p-6">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5" style={{ fill: 'var(--ink)', color: 'var(--ink)' }} />
                  ))}
                </div>
                <p className="text-[14px] leading-relaxed mb-5" style={{ color: 'var(--ink-2)' }}>
                  “{t.quote}”
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-semibold"
                    style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                  >
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold" style={{ color: 'var(--ink)' }}>{t.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-dim)' }}>{t.role}</p>
                  </div>
                </div>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

function Pricing() {
  const [loadingInterval, setLoadingInterval] = useState<'month' | 'year' | null>(null);

  async function handleSubscribe(interval: 'month' | 'year') {
    setLoadingInterval(interval);
    try {
      await startStripeCheckout(interval, { nextPath: '/#pricing' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar checkout');
      setLoadingInterval(null);
    }
  }

  const plans = [
    {
      name: 'Mensal',
      desc: 'Sem fidelidade. Cancele quando quiser.',
      price: 'R$59,50',
      sub: '/mês',
      footnote: 'Cobrança recorrente mensal',
      highlight: false,
      badge: null as string | null,
      interval: 'month' as const,
    },
    {
      name: 'Anual',
      desc: 'Compromisso anual com o melhor preço.',
      price: 'R$499',
      sub: '/ano',
      footnote: 'Equivalente a R$41,58/mês — economize R$215 no ano',
      highlight: true,
      badge: 'Economize 30%',
      interval: 'year' as const,
    },
  ];

  const perks = [
    'Créditos de IA todo mês (200 no mensal, 300 no anual)',
    'Threads e tweets no seu tom',
    'News Cards editoriais',
    'Agenda de postagem',
    'Editor premium',
    'Exportação Full HD',
    'Imagens com IA (GPT-image)',
    'Acesso ao roadmap e updates',
  ];

  return (
    <section id="pricing" className="py-24 px-4" style={{ background: 'var(--paper)' }}>
      <div className="max-w-4xl mx-auto">
        <FadeUp className="text-center mb-14">
          <p className="font-mono text-[10.5px] tracking-[0.18em] uppercase mb-3" style={{ color: 'var(--ink-dim)' }}>
            Preços
          </p>
          <h2 className="font-display mb-4" style={{ fontSize: 'clamp(36px, 5vw, 60px)', letterSpacing: '-0.025em', color: 'var(--ink)' }}>
            Um plano. Você <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>escolhe o ritmo.</span>
          </h2>
          <p className="text-[13.5px]" style={{ color: 'var(--ink-dim)' }}>
            Tudo incluído. A diferença é só o ciclo de cobrança.
          </p>
        </FadeUp>

        <div className="grid md:grid-cols-2 gap-5 mb-10">
          {plans.map((plan, i) => (
            <FadeUp key={i} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ duration: 0.3 }}
                className="relative rounded-[14px] p-7 flex flex-col h-full"
                style={{
                  background: plan.highlight ? 'var(--ink)' : 'var(--paper)',
                  color: plan.highlight ? 'var(--paper)' : 'var(--ink)',
                  border: '1.5px solid var(--ink)',
                  boxShadow: plan.highlight ? 'var(--sh-3)' : 'var(--sh-2)',
                }}
              >
                {plan.badge && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.14em] uppercase px-3 py-1 rounded-full whitespace-nowrap"
                    style={{ background: 'var(--accent)', color: '#fff', border: '1.5px solid var(--ink)', boxShadow: 'var(--sh-1)' }}
                  >
                    {plan.badge}
                  </div>
                )}
                <p className="text-[15px] font-semibold mb-1">{plan.name}</p>
                <p className="text-[12px] mb-6" style={{ opacity: 0.7 }}>{plan.desc}</p>
                <div className="mb-2 flex items-baseline">
                  <span className="font-display" style={{ fontSize: 56, lineHeight: 1 }}>{plan.price}</span>
                  <span className="ml-1.5 text-[13px] font-mono" style={{ opacity: 0.6 }}>{plan.sub}</span>
                </div>
                <p className="text-[11px] mb-6" style={{ opacity: 0.55 }}>{plan.footnote}</p>
                <button
                  type="button"
                  onClick={() => handleSubscribe(plan.interval)}
                  disabled={loadingInterval !== null}
                  className="brand-btn mt-auto justify-center"
                  style={
                    plan.highlight
                      ? { background: 'var(--paper)', color: 'var(--ink)' }
                      : { background: 'var(--ink)', color: 'var(--paper)' }
                  }
                >
                  {loadingInterval === plan.interval && (
                    <span
                      className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                      aria-hidden
                    />
                  )}
                  Assinar plano {plan.name.toLowerCase()}
                </button>
              </motion.div>
            </FadeUp>
          ))}
        </div>

        <FadeIn>
          <div
            className="rounded-[14px] p-6"
            style={{
              background: 'var(--paper-2)',
              border: '1.5px solid var(--ink)',
              boxShadow: 'var(--sh-2)',
            }}
          >
            <p className="section-kicker mb-4">Todos os planos incluem</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {perks.map((perk, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                  <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                  {perk}
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Final CTA ───────────────────────────────────────────────────────────────

function FinalCTA() {
  const compare = [
    { label: 'Continuar como está', icon: X,     items: ['Sem alcance orgânico', 'Sem clientes novos', 'Sem previsibilidade de vendas', 'Concorrentes crescendo enquanto você trava'], bad: true },
    { label: 'Ativar o Creatools',  icon: Check, items: ['Conteúdo profissional todos os dias', 'Mais alcance e engajamento', 'Mais seguidores qualificados', 'Mais vendas no automático'], bad: false },
  ];

  return (
    <section className="py-24 px-4" style={{ background: 'var(--paper-2)' }}>
      <div className="max-w-5xl mx-auto text-center">
        <FadeUp>
          <h2 className="font-display mb-4 leading-[1.05]" style={{ fontSize: 'clamp(36px, 5vw, 56px)', letterSpacing: '-0.025em', color: 'var(--ink)' }}>
            Daqui a 6 meses, seu Instagram<br />
            vai estar vendendo todos os dias<br />
            <span style={{ fontStyle: 'italic', color: 'var(--ink-dim)' }}>ou vai continuar como está?</span>
          </h2>
          <p className="text-[13.5px] mb-14" style={{ color: 'var(--ink-dim)' }}>
            A diferença entre esses dois cenários começa com uma decisão simples.
          </p>
        </FadeUp>

        <div className="grid md:grid-cols-2 gap-5 mb-14 text-left">
          {compare.map((col, i) => (
            <FadeUp key={i} delay={i * 0.15}>
              <div
                className="rounded-[14px] p-6"
                style={{
                  background: col.bad ? 'var(--paper)' : 'var(--ink)',
                  color: col.bad ? 'var(--ink)' : 'var(--paper)',
                  border: '1.5px solid var(--ink)',
                  boxShadow: col.bad ? 'var(--sh-1)' : 'var(--sh-3)',
                }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <col.icon className="w-4 h-4" style={{ color: col.bad ? 'var(--ink-dim)' : 'currentColor' }} />
                  <p className="text-[13px] font-semibold" style={{ color: col.bad ? 'var(--ink-dim)' : 'currentColor' }}>
                    {col.label}
                  </p>
                </div>
                <ul className="space-y-3">
                  {col.items.map((item, j) => (
                    <li
                      key={j}
                      className="text-[13px] leading-snug"
                      style={{
                        color: col.bad ? 'var(--ink-dim)' : 'var(--paper)',
                        textDecoration: col.bad ? 'line-through' : 'none',
                        opacity: col.bad ? 0.7 : 0.9,
                      }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp>
          <Link href="/dashboard" className="brand-btn primary" style={{ padding: '14px 24px', fontSize: 15 }}>
            Criar meu primeiro post agora
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] mt-4" style={{ color: 'var(--ink-dim) ' }}>
            Sem cartão de crédito · Acesso imediato
          </p>
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      className="py-10 px-4"
      style={{
        borderTop: '1.5px solid var(--ink)',
        background: 'var(--paper)',
      }}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="brand-mark sm">
            <Image src="/LOGO_SEMFUNDO.png" alt="Creatools" width={26} height={26} style={{ filter: 'invert(1)' }} />
          </span>
          <span className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>creatools</span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-dim)' }}>
          © 2026 Creatools · Todos os direitos reservados
        </p>
        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-dim)' }}>
          <a href="#" className="hover:opacity-70">Privacidade</a>
          <a href="#" className="hover:opacity-70">Termos</a>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <Nav />
      <Hero />
      <TruthSection />
      <HowItWorks />
      <Features />
      <Testimonials />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  );
}
