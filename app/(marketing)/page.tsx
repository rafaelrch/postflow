'use client';

import { useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import {
  Sparkles, Zap, Download, Users, ArrowRight, Check, X,
  ChevronDown, Star, LayoutTemplate, Type, Image as ImageIcon,
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
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-black dark:bg-white rounded-lg flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white dark:text-black" />
        </div>
        <span className="font-semibold text-sm tracking-tight text-gray-900 dark:text-white">PostFlow</span>
      </div>

      <nav className="hidden md:flex items-center gap-6 text-sm text-gray-500 dark:text-white/50">
        <a href="#features" className="hover:text-gray-900 dark:hover:text-white transition-colors">Funcionalidades</a>
        <a href="#how" className="hover:text-gray-900 dark:hover:text-white transition-colors">Como funciona</a>
        <a href="#pricing" className="hover:text-gray-900 dark:hover:text-white transition-colors">Preços</a>
      </nav>

      <Link
        href="/dashboard"
        className="flex items-center gap-1.5 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-medium px-4 py-2 rounded-full hover:opacity-80 transition-opacity"
      >
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
    <section ref={ref} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#F7F6F3] dark:bg-[#0A0A0A] px-4 pt-20">
      {/* Subtle grid */}
      <div className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <motion.div style={{ y, opacity }} className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 inline-flex items-center gap-2 bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-full px-4 py-1.5 text-xs font-medium text-gray-600 dark:text-white/60"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          IA treinada para carrosséis virais
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-gray-900 dark:text-white leading-[0.95] mb-6"
        >
          Carrosséis virais.<br />
          <span className="italic font-light">Em 3 minutos.</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
          className="text-lg md:text-xl text-gray-500 dark:text-white/50 max-w-xl leading-relaxed mb-10"
        >
          A IA cria texto persuasivo, design profissional e posts prontos para publicar.
          Sem Canva. Sem designer. Sem perder horas.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-black font-semibold text-sm px-7 py-3.5 rounded-full hover:opacity-85 transition-all hover:gap-3"
          >
            Criar meu primeiro carrossel
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <span className="text-xs text-gray-400 dark:text-white/30">Sem cartão de crédito</span>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-10 flex items-center gap-3"
        >
          <div className="flex -space-x-2">
            {['#1a1a1a', '#3d3d3d', '#666', '#999', '#bbb'].map((bg, i) => (
              <div key={i} className="w-7 h-7 rounded-full border-2 border-[#F7F6F3] dark:border-[#0A0A0A]" style={{ background: bg }} />
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-white/40">
            Usado por <span className="text-gray-700 dark:text-white/70 font-medium">+2.000 creators</span> e profissionais
          </p>
        </motion.div>
      </motion.div>

      {/* Preview cards floating */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.8 }}
        className="relative z-10 mt-16 w-full max-w-3xl mx-auto"
      >
        <PreviewCards />
      </motion.div>

      {/* Scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
      >
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}>
          <ChevronDown className="w-4 h-4 text-gray-300 dark:text-white/20" />
        </motion.div>
      </motion.div>
    </section>
  );
}

function PreviewCards() {
  const slides = [
    { title: '5 erros que te impedem de vender no Instagram', accent: '#111', light: false },
    { title: 'Como dobrar seu engajamento em 7 dias', accent: '#f5f5f5', light: true },
    { title: 'O método que uso para criar 10 posts por semana', accent: '#1a1a1a', light: false },
  ];

  return (
    <div className="relative h-48 flex items-end justify-center gap-4">
      {slides.map((s, i) => {
        const offsets = [-1, 0, 1];
        const rotations = [-4, 0, 4];
        const zIndexes = [1, 10, 1];
        const ys = [16, 0, 16];
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: ys[i] }}
            transition={{ duration: 0.8, delay: 0.9 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: ys[i] - 8, rotate: 0, zIndex: 20, transition: { duration: 0.3 } }}
            style={{
              rotate: rotations[i],
              zIndex: zIndexes[i],
              x: offsets[i] * 8,
            }}
            className="w-36 h-44 rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden shadow-xl cursor-pointer"
          >
            <div className="w-full h-full p-4 flex flex-col justify-end" style={{ background: s.accent }}>
              <div className="w-8 h-0.5 mb-3 rounded-full" style={{ background: s.light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }} />
              <p className="text-[10px] font-semibold leading-tight" style={{ color: s.light ? '#111' : '#fff' }}>
                {s.title}
              </p>
              <div className="mt-3 flex gap-1">
                {[1, 2, 3].map(j => (
                  <div key={j} className="h-0.5 rounded-full flex-1" style={{ background: s.light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)' }} />
                ))}
              </div>
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
    <section className="bg-gray-900 dark:bg-white py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <FadeUp>
          <p className="text-xs font-semibold tracking-widest uppercase text-white/40 dark:text-black/40 mb-4">A verdade que ninguém conta</p>
          <h2 className="text-3xl md:text-5xl font-bold text-white dark:text-gray-900 leading-tight mb-8">
            O algoritmo prioriza carrosséis.<br />
            <span className="text-white/40 dark:text-black/40">Quem não posta, não aparece.</span>
          </h2>
        </FadeUp>
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {[
            { stat: '3h', label: 'tempo médio gasto no Canva por carrossel' },
            { stat: '10×', label: 'mais rápido com IA calibrada para virais' },
            { stat: '#1', label: 'formato com mais alcance orgânico em 2026' },
          ].map((item, i) => (
            <FadeUp key={i} delay={i * 0.1}>
              <div className="border border-white/10 dark:border-black/10 rounded-2xl p-6">
                <p className="text-5xl font-bold text-white dark:text-gray-900 mb-2">{item.stat}</p>
                <p className="text-sm text-white/50 dark:text-black/50 leading-snug">{item.label}</p>
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
    {
      n: '01',
      title: 'Descreva seu conteúdo',
      desc: 'Digite o tema, nicho e tom de voz. Uma frase simples como "5 dicas de marketing digital" já é suficiente.',
      icon: Type,
    },
    {
      n: '02',
      title: 'A IA cria tudo',
      desc: 'Em segundos, a IA gera texto persuasivo, escolhe o layout perfeito e monta o carrossel completo.',
      icon: Sparkles,
    },
    {
      n: '03',
      title: 'Publique e viralize',
      desc: 'Exporte em Full HD. Pronto — seu carrossel está no ar conquistando seguidores e vendas.',
      icon: Download,
    },
  ];

  return (
    <section id="how" className="py-24 px-4 bg-[#F7F6F3] dark:bg-[#0A0A0A]">
      <div className="max-w-4xl mx-auto">
        <FadeUp className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-white/30 mb-3">Como funciona</p>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
            Tão simples que parece mágica
          </h2>
        </FadeUp>

        <div className="relative">
          {/* connector line */}
          <div className="hidden md:block absolute left-[calc(50%-0.5px)] top-8 bottom-8 w-px bg-black/8 dark:bg-white/8" />

          <div className="flex flex-col gap-6">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isRight = i % 2 === 1;
              return (
                <FadeUp key={i} delay={i * 0.15}>
                  <div className={`flex items-center gap-6 ${isRight ? 'md:flex-row-reverse' : 'md:flex-row'} flex-row`}>
                    <div className={`flex-1 ${isRight ? 'md:text-right' : 'md:text-left'}`}>
                      <p className="text-xs font-mono text-gray-300 dark:text-white/20 mb-1">{step.n}</p>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed max-w-xs">{step.desc}</p>
                    </div>
                    {/* center icon */}
                    <div className="shrink-0 w-14 h-14 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center shadow-lg z-10">
                      <Icon className="w-6 h-6 text-white dark:text-black" />
                    </div>
                    <div className="flex-1 hidden md:block" />
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features ────────────────────────────────────────────────────────────────

function Features() {
  const features = [
    {
      icon: Sparkles,
      title: 'Carrosséis gerados por IA',
      desc: 'Você informa o tema e tom de voz; a IA monta slides com layout coerente, prontos para publicar — sem começar do zero.',
    },
    {
      icon: Type,
      title: 'Texto e roteiro prontos',
      desc: 'Títulos, gancho e copy dos slides saem sugeridos pela IA — você só ajusta o que quiser, sem depender do ChatGPT em outra aba.',
    },
    {
      icon: LayoutTemplate,
      title: 'Editor visual simples',
      desc: 'Ajuste cores, fontes, imagens e espaçamentos. Nada de curva de aprendizado de ferramentas profissionais pesadas.',
    },
    {
      icon: Download,
      title: 'Exportação Full HD',
      desc: 'Baixe em PNG 1080px — formato ideal para feed e carrossel no Instagram — sem perder nitidez.',
    },
    {
      icon: Zap,
      title: 'Conteúdo em minutos',
      desc: 'O fluxo é pensado para você produzir vários carrosséis na mesma sessão. Menos tempo em design, mais tempo vendendo.',
    },
    {
      icon: ImageIcon,
      title: 'Imagens com fator viral',
      desc: 'Você não precisa de mega-prompts: o fluxo já vem calibrado para gerar imagens que se destacam no feed.',
    },
  ];

  return (
    <section id="features" className="py-24 px-4 bg-white dark:bg-[#111]">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-white/30 mb-3">Tudo incluso</p>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
            Um software. Resultado completo.
          </h2>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <FadeUp key={i} delay={i * 0.08}>
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="group p-6 rounded-2xl border border-black/8 dark:border-white/8 hover:border-black/20 dark:hover:border-white/20 hover:bg-[#F7F6F3] dark:hover:bg-white/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-white dark:text-black" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed">{f.desc}</p>
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
    {
      name: 'Camila Alves',
      role: 'Marketing B2B',
      quote: 'Carrossel de funil bateu +48% de salvamentos vs. o resto do feed no mesmo mês — sem eu passar o fim de semana no Canva.',
    },
    {
      name: 'Rafael Santos',
      role: 'Infoprodutor',
      quote: 'Lead perguntou qual agência fez o layout. Era eu no PostFlow à noite. Na terça seguinte fechou pacote de consultoria.',
    },
    {
      name: 'Juliana Menezes',
      role: 'Mentora',
      quote: 'Antes eu gravava Reels no improviso. Agora o carrossel da semana sai no domingo — só adapto o gancho pro vídeo.',
    },
    {
      name: 'Lucas Pereira',
      role: 'Fitness',
      quote: 'Testei o gancho que a IA sugeriu no 1º slide: salvamentos de 4% → 11% no mesmo nicho. Não foi sorte.',
    },
    {
      name: 'Bianca Ferreira',
      role: 'Estética',
      quote: 'Mesmo template, skincare e contador — só troco paleta. Cliente disse que parecia marca com rebranding.',
    },
    {
      name: 'Diego Rocha',
      role: 'Consultor',
      quote: 'DMs com "quanto custa?" triplicaram no mês em que padronizei carrossel. Coincidiu com PostFlow — não foi viralidade aleatória.',
    },
  ];

  return (
    <section className="py-24 px-4 bg-[#F7F6F3] dark:bg-[#0A0A0A] overflow-hidden">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-white/30 mb-3">Depoimentos</p>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
            Creators que publicam<br />com consistência
          </h2>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <FadeUp key={i} delay={i * 0.07}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25 }}
                className="bg-white dark:bg-white/5 border border-black/8 dark:border-white/8 rounded-2xl p-6"
              >
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 fill-gray-900 dark:fill-white text-gray-900 dark:text-white" />
                  ))}
                </div>
                <p className="text-sm text-gray-700 dark:text-white/80 leading-relaxed mb-5">"{t.quote}"</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-white/50">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{t.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-white/30">{t.role}</p>
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
  const plans = [
    {
      name: 'Semanal',
      desc: 'Experimente por 7 dias',
      price: 'R$37',
      sub: '/semana',
      highlight: false,
    },
    {
      name: 'Mensal',
      desc: 'Acesso completo, sem fidelidade',
      price: 'R$67',
      sub: '/mês',
      highlight: false,
    },
    {
      name: 'Anual',
      desc: 'Melhor custo-benefício',
      price: 'R$197',
      sub: '/ano — ~R$16/mês',
      highlight: true,
    },
  ];

  const perks = [
    'Carrosséis ilimitados',
    'IA para textos e copys persuasivas',
    'Editor premium e intuitivo',
    'Exportação Full HD ilimitada',
    'Imagens com fator viral',
    'Cancele quando quiser',
  ];

  return (
    <section id="pricing" className="py-24 px-4 bg-white dark:bg-[#111]">
      <div className="max-w-4xl mx-auto">
        <FadeUp className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-white/30 mb-3">Preços</p>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
            Comece hoje
          </h2>
          <p className="text-gray-500 dark:text-white/40 text-sm">
            Ferramentas separadas custariam mais de R$650/mês. Aqui, tudo em um só lugar.
          </p>
        </FadeUp>

        <div className="grid md:grid-cols-3 gap-4 mb-10">
          {plans.map((plan, i) => (
            <FadeUp key={i} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ duration: 0.3 }}
                className={`relative rounded-2xl p-6 border flex flex-col ${
                  plan.highlight
                    ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                    : 'border-black/8 dark:border-white/8 hover:border-black/20 dark:hover:border-white/20'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full">
                    Mais escolhido
                  </div>
                )}
                <p className={`text-sm font-semibold mb-0.5 ${plan.highlight ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white'}`}>
                  {plan.name}
                </p>
                <p className={`text-[11px] mb-6 ${plan.highlight ? 'text-white/50 dark:text-black/50' : 'text-gray-400 dark:text-white/30'}`}>
                  {plan.desc}
                </p>
                <div className="mb-6">
                  <span className={`text-4xl font-bold ${plan.highlight ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white'}`}>
                    {plan.price}
                  </span>
                  <span className={`text-xs ml-1 ${plan.highlight ? 'text-white/50 dark:text-black/50' : 'text-gray-400 dark:text-white/30'}`}>
                    {plan.sub}
                  </span>
                </div>
                <Link
                  href="/dashboard"
                  className={`mt-auto text-center text-sm font-semibold py-2.5 rounded-xl transition-opacity hover:opacity-80 ${
                    plan.highlight
                      ? 'bg-white dark:bg-black text-black dark:text-white'
                      : 'bg-gray-900 dark:bg-white text-white dark:text-black'
                  }`}
                >
                  Começar agora
                </Link>
              </motion.div>
            </FadeUp>
          ))}
        </div>

        {/* Perks list */}
        <FadeIn>
          <div className="border border-black/8 dark:border-white/8 rounded-2xl p-6">
            <p className="text-xs font-semibold text-gray-400 dark:text-white/30 uppercase tracking-wider mb-4">Todos os planos incluem</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {perks.map((perk, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/70">
                  <Check className="w-4 h-4 text-gray-900 dark:text-white shrink-0" />
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
    {
      label: 'Continuar como está',
      icon: X,
      items: ['Sem alcance orgânico', 'Sem clientes novos', 'Sem previsibilidade de vendas', 'Concorrentes crescendo enquanto você trava'],
      bad: true,
    },
    {
      label: 'Ativar o PostFlow',
      icon: Check,
      items: ['Conteúdo profissional todos os dias', 'Mais alcance e engajamento', 'Mais seguidores qualificados', 'Mais vendas no automático'],
      bad: false,
    },
  ];

  return (
    <section className="py-24 px-4 bg-[#F7F6F3] dark:bg-[#0A0A0A]">
      <div className="max-w-4xl mx-auto text-center">
        <FadeUp>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight mb-4 leading-tight">
            Daqui a 6 meses, seu Instagram<br />vai estar vendendo todos os dias<br />
            <span className="text-gray-400 dark:text-white/30">ou vai continuar como está?</span>
          </h2>
          <p className="text-gray-500 dark:text-white/40 text-sm mb-14">
            A diferença entre esses dois cenários começa com uma decisão simples.
          </p>
        </FadeUp>

        <div className="grid md:grid-cols-2 gap-4 mb-14 text-left">
          {compare.map((col, i) => (
            <FadeUp key={i} delay={i * 0.15}>
              <div className={`rounded-2xl p-6 border ${col.bad ? 'border-black/8 dark:border-white/8' : 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white'}`}>
                <div className="flex items-center gap-2 mb-5">
                  <col.icon className={`w-4 h-4 ${col.bad ? 'text-gray-400 dark:text-white/30' : 'text-white dark:text-black'}`} />
                  <p className={`text-sm font-semibold ${col.bad ? 'text-gray-400 dark:text-white/30' : 'text-white dark:text-black'}`}>
                    {col.label}
                  </p>
                </div>
                <ul className="space-y-3">
                  {col.items.map((item, j) => (
                    <li key={j} className={`text-sm leading-snug ${col.bad ? 'text-gray-400 dark:text-white/30 line-through' : 'text-white/80 dark:text-black/80'}`}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-black font-semibold text-base px-8 py-4 rounded-full hover:opacity-85 transition-all hover:gap-3 group"
          >
            Criar meu primeiro carrossel agora
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <p className="text-xs text-gray-400 dark:text-white/30 mt-4">Sem cartão de crédito. Acesso imediato.</p>
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="py-10 px-4 border-t border-black/8 dark:border-white/8 bg-white dark:bg-[#111]">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-900 dark:bg-white rounded-md flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white dark:text-black" />
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">PostFlow</span>
        </div>
        <p className="text-xs text-gray-400 dark:text-white/30">© 2026 PostFlow. Todos os direitos reservados.</p>
        <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-white/30">
          <a href="#" className="hover:text-gray-700 dark:hover:text-white/60 transition-colors">Privacidade</a>
          <a href="#" className="hover:text-gray-700 dark:hover:text-white/60 transition-colors">Termos</a>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F7F6F3] dark:bg-[#0A0A0A] font-[var(--font-inter)]">
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
