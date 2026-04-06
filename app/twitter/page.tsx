'use client';

import { useState } from 'react';
import { Sparkles, Copy, Check, RefreshCw, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.623L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
  </svg>
);

const PROJECTS = [
  { value: 'arke', label: 'ARKE' },
  { value: 'ark-studio', label: 'ARK Studio' },
  { value: 'postflow', label: 'PostFlow' },
  { value: 'outro', label: 'Outro projeto' },
];

const TONES = [
  { value: 'honesto', label: 'Honesto', desc: 'Direto e vulnerável' },
  { value: 'tecnico', label: 'Técnico', desc: 'Foco em produto/código' },
  { value: 'storytelling', label: 'Story', desc: 'Narrativa com começo e fim' },
  { value: 'milestone', label: 'Milestone', desc: 'Conquista com contexto' },
  { value: 'aprendizado', label: 'Aprendizado', desc: 'Lição aprendida' },
];

interface Tweet {
  tone: string;
  content: string;
  hook: string;
}

function TweetCard({ tweet, index }: { tweet: Tweet; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(tweet.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Tweet copiado!');
  };

  const charCount = tweet.content.length;
  const isLong = charCount > 280;

  return (
    <div className="bg-[var(--surface)] border border-black/8 dark:border-white/8 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-wider">
            Versão {index + 1}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-gray-900/50 dark:text-white/50 font-medium">
            {tweet.tone}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[10px] font-mono',
            isLong ? 'text-red-500' : charCount > 240 ? 'text-yellow-500' : 'text-gray-900/30 dark:text-white/30'
          )}>
            {charCount}/280
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-[11px] font-medium hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Tweet content */}
      <div className="p-4">
        {/* Mock Twitter card */}
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-black/10 dark:bg-white/10 shrink-0 flex items-center justify-center">
            <XIcon className="w-4 h-4 text-gray-900/40 dark:text-white/40" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm font-bold text-gray-900 dark:text-white">Você</span>
              <span className="text-xs text-gray-900/40 dark:text-white/40">@seuhandle</span>
            </div>
            <p className="text-sm text-gray-900 dark:text-white leading-relaxed whitespace-pre-wrap">
              {tweet.content}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TwitterPage() {
  const [project, setProject] = useState('arke');
  const [customProject, setCustomProject] = useState('');
  const [update, setUpdate] = useState('');
  const [context, setContext] = useState('');
  const [selectedTone, setSelectedTone] = useState('honesto');
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [showContext, setShowContext] = useState(false);

  const handleGenerate = async () => {
    if (!update.trim()) {
      toast.error('Descreva o que aconteceu primeiro');
      return;
    }
    setLoading(true);
    setTweets([]);
    try {
      const projectName = project === 'outro' ? customProject || 'meu projeto' : PROJECTS.find(p => p.value === project)?.label || project;
      const res = await fetch('/api/generate-tweet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectName,
          update,
          tone: selectedTone,
          context: context || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar tweets');
      setTweets(data.tweets || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar tweets');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--background)]">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
              <XIcon className="w-4 h-4 text-white dark:text-black" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Build in Public</h1>
          </div>
          <p className="text-gray-900/50 dark:text-white/50 text-sm">
            Documente o que você está construindo e gere tweets autênticos para o Twitter/X.
          </p>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-5">

          {/* Project selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-2">
              Projeto
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECTS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setProject(p.value)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors border',
                    project === p.value
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white'
                      : 'bg-transparent border-black/15 dark:border-white/15 text-gray-900/60 dark:text-white/60 hover:border-black/30 dark:hover:border-white/30 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {project === 'outro' && (
              <input
                className="mt-2 w-full px-3 py-2 rounded-lg bg-[var(--surface-elevated)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/30 dark:focus:border-white/30"
                placeholder="Nome do projeto"
                value={customProject}
                onChange={(e) => setCustomProject(e.target.value)}
              />
            )}
          </div>

          {/* Main update textarea */}
          <div>
            <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-2">
              O que aconteceu? O que você quer compartilhar?
            </label>
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
              rows={5}
              placeholder="Ex: Hoje finalizei o onboarding do PostFlow. Levou 3 semanas, muito mais do que esperava. Aprendi que usuários não leem textos — precisei simplificar tudo. Taxa de conclusão foi de 23% para 71%."
              value={update}
              onChange={(e) => setUpdate(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end mt-1">
              <span className="text-[10px] text-gray-900/30 dark:text-white/30">{update.length} caracteres</span>
            </div>
          </div>

          {/* Context (collapsible) */}
          <div>
            <button
              onClick={() => setShowContext(!showContext)}
              className="flex items-center gap-1.5 text-xs text-gray-900/40 dark:text-white/40 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors"
            >
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showContext && 'rotate-180')} />
              Contexto adicional (opcional)
            </button>
            {showContext && (
              <textarea
                className="mt-2 w-full px-4 py-3 rounded-xl bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
                rows={3}
                placeholder="Ex: A ARKE é uma agência de branding estratégico. Estou construindo o PostFlow como produto interno..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            )}
          </div>

          {/* Tone selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-2">
              Tom
            </label>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSelectedTone(t.value)}
                  className={cn(
                    'flex flex-col px-3.5 py-2 rounded-xl text-left transition-colors border',
                    selectedTone === t.value
                      ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                      : 'bg-transparent border-black/15 dark:border-white/15 hover:border-black/30 dark:hover:border-white/30'
                  )}
                >
                  <span className={cn('text-xs font-semibold', selectedTone === t.value ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white')}>
                    {t.label}
                  </span>
                  <span className={cn('text-[10px]', selectedTone === t.value ? 'text-white/70 dark:text-black/70' : 'text-gray-900/40 dark:text-white/40')}>
                    {t.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !update.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Gerando tweets...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Gerar 3 versões de tweet
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {tweets.length > 0 && (
          <div className="mt-8 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900/60 dark:text-white/60 uppercase tracking-wider">
                Versões geradas
              </h2>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-gray-900/40 dark:text-white/40 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Gerar novamente
              </button>
            </div>
            {tweets.map((tweet, i) => (
              <TweetCard key={i} tweet={tweet} index={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && tweets.length === 0 && (
          <div className="mt-10 text-center py-12 border border-dashed border-black/10 dark:border-white/10 rounded-2xl">
            <XIcon className="w-8 h-8 text-gray-900/15 dark:text-white/15 mx-auto mb-3" />
            <p className="text-sm text-gray-900/30 dark:text-white/30">
              Descreva o que aconteceu e gere seus tweets
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
