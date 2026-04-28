'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles, Copy, Check, RefreshCw, ChevronDown,
  Plus, X, Pencil, Trash2, Briefcase, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useProjects, Project } from '@/hooks/useProjects';

// ── Icons ──────────────────────────────────────────────────────────────────────

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.623L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
  </svg>
);

// ── Constants ──────────────────────────────────────────────────────────────────

const TONES = [
  { value: 'honesto',      label: 'Honesto',      desc: 'Direto e vulnerável' },
  { value: 'tecnico',      label: 'Técnico',       desc: 'Foco em produto/código' },
  { value: 'storytelling', label: 'Story',         desc: 'Narrativa com começo e fim' },
  { value: 'milestone',    label: 'Milestone',     desc: 'Conquista com contexto' },
  { value: 'aprendizado',  label: 'Aprendizado',   desc: 'Lição aprendida' },
];

const NICHES = ['SaaS', 'Design', 'Fintech', 'Educação', 'E-commerce', 'Saúde', 'IA', 'Marketing', 'Outro'];

// ── Project modal ──────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', description: '', niche: '', audience: '', defaultTone: '' };
type FormData = typeof EMPTY_FORM;

function ProjectForm({ initial, onSave, onCancel }: {
  initial: FormData;
  onSave: (d: FormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [showAdv, setShowAdv] = useState(!!(initial.niche || initial.audience || initial.defaultTone));
  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-1.5">
          Nome <span className="text-red-400">*</span>
        </label>
        <input
          autoFocus
          className="w-full px-3 py-2.5 rounded-xl bg-[var(--background)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/25 dark:placeholder-white/25 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors"
          placeholder="Ex: PostFlow, Meu estúdio..."
          value={form.name}
          onChange={e => set('name', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-1.5">
          Descrição
        </label>
        <textarea
          rows={4}
          className="w-full px-3 py-2.5 rounded-xl bg-[var(--background)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/25 dark:placeholder-white/25 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
          placeholder="O que é esse projeto? O que você está construindo? Estágio atual, MRR, quem usa..."
          value={form.description}
          onChange={e => set('description', e.target.value)}
        />
        <p className="text-[10px] text-gray-900/30 dark:text-white/30 mt-1">Quanto mais contexto, melhor o tweet gerado.</p>
      </div>

      <button
        type="button"
        onClick={() => setShowAdv(v => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-900/40 dark:text-white/40 hover:text-gray-900/70 dark:hover:text-white/70 transition-colors self-start"
      >
        {showAdv ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Configurações avançadas
      </button>

      {showAdv && (
        <div className="flex flex-col gap-4 pl-4 border-l border-black/8 dark:border-white/8">
          <div>
            <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-1.5">Nicho</label>
            <div className="flex flex-wrap gap-1.5">
              {NICHES.map(n => (
                <button key={n} type="button" onClick={() => set('niche', form.niche === n ? '' : n)}
                  className={`px-3 py-1 rounded-full text-xs transition-colors border ${form.niche === n ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white' : 'border-black/15 dark:border-white/15 text-gray-900/60 dark:text-white/60 hover:border-black/30 dark:hover:border-white/30'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-1.5">Público-alvo</label>
            <input
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--background)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/25 dark:placeholder-white/25 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors"
              placeholder="Ex: founders early-stage, devs, empreendedores..."
              value={form.audience}
              onChange={e => set('audience', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-1.5">Tom padrão</label>
            <div className="flex flex-wrap gap-1.5">
              {TONES.map(t => (
                <button key={t.value} type="button" onClick={() => set('defaultTone', form.defaultTone === t.value ? '' : t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${form.defaultTone === t.value ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white' : 'border-black/15 dark:border-white/15 text-gray-900/60 dark:text-white/60 hover:border-black/30 dark:hover:border-white/30'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-sm text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:border-black/25 dark:hover:border-white/25 transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={() => { if (!form.name.trim()) { toast.error('Dê um nome ao projeto'); return; } onSave(form); }}
          className="flex-1 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors">
          Salvar
        </button>
      </div>
    </div>
  );
}

type ModalMode = { type: 'create' } | { type: 'edit'; project: Project } | { type: 'list' } | null;

function ProjectsModal({ projects, onClose, onSelect, onAdd, onUpdate, onDelete }: {
  projects: Project[];
  onClose: () => void;
  onSelect: (p: Project) => void;
  onAdd: (data: Omit<Project, 'id' | 'createdAt'>) => Project;
  onUpdate: (id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  onDelete: (id: string) => void;
}) {
  const [mode, setMode] = useState<ModalMode>({ type: projects.length === 0 ? 'create' : 'list' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleCreate = (form: FormData) => {
    const p = onAdd(form);
    toast.success('Projeto criado!');
    onSelect(p);
    onClose();
  };

  const handleUpdate = (id: string, form: FormData) => {
    onUpdate(id, form);
    toast.success('Projeto atualizado!');
    setMode({ type: 'list' });
  };

  const handleDelete = (id: string) => {
    onDelete(id);
    setConfirmDelete(null);
    toast.success('Projeto removido');
  };

  const title = mode?.type === 'create' ? 'Novo projeto'
    : mode?.type === 'edit' ? 'Editar projeto'
    : 'Projetos';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-[var(--surface)] border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            {mode?.type !== 'list' && projects.length > 0 && (
              <button onClick={() => setMode({ type: 'list' })} className="p-1 -ml-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-gray-900/40 dark:text-white/40 transition-colors">
                <ChevronDown className="w-4 h-4 rotate-90" />
              </button>
            )}
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
          </div>
          <div className="flex items-center gap-1">
            {mode?.type === 'list' && (
              <button onClick={() => setMode({ type: 'create' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Novo
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-gray-900/40 dark:text-white/40 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Create form */}
          {mode?.type === 'create' && (
            <ProjectForm
              initial={{ ...EMPTY_FORM }}
              onSave={handleCreate}
              onCancel={() => projects.length > 0 ? setMode({ type: 'list' }) : onClose()}
            />
          )}

          {/* Edit form */}
          {mode?.type === 'edit' && (
            <ProjectForm
              initial={{
                name: mode.project.name,
                description: mode.project.description,
                niche: mode.project.niche || '',
                audience: mode.project.audience || '',
                defaultTone: mode.project.defaultTone || '',
              }}
              onSave={(form) => handleUpdate(mode.project.id, form)}
              onCancel={() => setMode({ type: 'list' })}
            />
          )}

          {/* List */}
          {mode?.type === 'list' && (
            <div className="flex flex-col gap-2">
              {projects.length === 0 ? (
                <div className="text-center py-10">
                  <Briefcase className="w-8 h-8 text-gray-900/15 dark:text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-gray-900/40 dark:text-white/40">Nenhum projeto ainda</p>
                </div>
              ) : projects.map(p => (
                <div key={p.id} className="rounded-xl border border-black/8 dark:border-white/8 overflow-hidden">
                  <button
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    onClick={() => { onSelect(p); onClose(); }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{p.name}</span>
                        {p.niche && <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-gray-900/50 dark:text-white/50">{p.niche}</span>}
                      </div>
                      {p.description && <p className="text-xs text-gray-900/50 dark:text-white/50 mt-0.5 line-clamp-1">{p.description}</p>}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setMode({ type: 'edit', project: p })}
                        className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-gray-900/30 dark:text-white/30 hover:text-gray-900 dark:hover:text-white transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDelete(p.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-900/30 dark:text-white/30 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </button>

                  {confirmDelete === p.id && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-black/6 dark:border-white/6 bg-red-500/5">
                      <p className="text-xs text-red-500 font-medium">Remover "{p.name}"?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(null)} className="px-2.5 py-1 rounded-lg border border-black/10 dark:border-white/10 text-xs text-gray-900/60 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
                        <button onClick={() => handleDelete(p.id)} className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors">Remover</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Tweet card ─────────────────────────────────────────────────────────────────

interface Tweet { tone: string; content: string; hook: string; }

function TweetCard({ tweet, index }: { tweet: Tweet; index: number }) {
  const [copied, setCopied] = useState(false);
  const charCount = tweet.content.length;

  return (
    <div className="bg-[var(--surface)] border border-black/8 dark:border-white/8 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-900/30 dark:text-white/30 uppercase tracking-wider">Versão {index + 1}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-gray-900/50 dark:text-white/50 font-medium">{tweet.tone}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-mono', charCount > 280 ? 'text-red-500' : charCount > 240 ? 'text-yellow-500' : 'text-gray-900/30 dark:text-white/30')}>
            {charCount}/280
          </span>
          <button
            onClick={async () => { await navigator.clipboard.writeText(tweet.content); setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success('Tweet copiado!'); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-[11px] font-medium hover:bg-gray-900/90 dark:hover:bg-white/90 transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>
      <div className="p-4">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-black/10 dark:bg-white/10 shrink-0 flex items-center justify-center">
            <XIcon className="w-4 h-4 text-gray-900/40 dark:text-white/40" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm font-bold text-gray-900 dark:text-white">Você</span>
              <span className="text-xs text-gray-900/40 dark:text-white/40">@seuhandle</span>
            </div>
            <p className="text-sm text-gray-900 dark:text-white leading-relaxed whitespace-pre-wrap">{tweet.content}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TwitterPage() {
  const { projects, addProject, updateProject, deleteProject } = useProjects();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [update, setUpdate] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [selectedTone, setSelectedTone] = useState('honesto');
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      const first = projects[0];
      setSelectedProjectId(first.id);
      if (first.defaultTone) setSelectedTone(first.defaultTone);
    }
  }, [projects, selectedProjectId]);

  const handleSelectProject = (p: Project) => {
    setSelectedProjectId(p.id);
    if (p.defaultTone) setSelectedTone(p.defaultTone);
  };

  const handleGenerate = async () => {
    if (!update.trim()) { toast.error('Descreva o que aconteceu primeiro'); return; }
    setLoading(true);
    setTweets([]);
    try {
      const res = await fetch('/api/generate-tweet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: selectedProject?.name || 'meu projeto',
          projectDescription: selectedProject?.description || '',
          projectNiche: selectedProject?.niche || '',
          projectAudience: selectedProject?.audience || '',
          update,
          tone: selectedTone,
          context: extraContext || undefined,
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
        <div className="mb-10">
          <span className="section-kicker flex items-center gap-2 mb-3">
            <span className="dot-live" aria-hidden />
            Studio · Twitter / X
          </span>
          <h1 className="section-title mb-2" style={{ fontSize: 'clamp(38px, 4.8vw, 60px)' }}>
            Build in <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>Public</span>
          </h1>
          <p className="text-[14px] max-w-lg leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
            Documente o que você está construindo. A IA gera tweets autênticos no seu tom e formato — prontos para postar.
          </p>
        </div>

        <div className="flex flex-col gap-5">

          {/* Project selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider">Projeto</label>
              <button
                onClick={() => setShowProjectsModal(true)}
                className="text-[10px] text-gray-900/40 dark:text-white/40 hover:text-gray-900/70 dark:hover:text-white/70 transition-colors"
              >
                Gerenciar projetos →
              </button>
            </div>

            {projects.length === 0 ? (
              <button
                onClick={() => setShowProjectsModal(true)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border-2 border-dashed border-black/10 dark:border-white/10 hover:border-gray-900 dark:hover:border-white transition-colors group text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center group-hover:bg-gray-900 dark:group-hover:bg-white transition-colors">
                  <Plus className="w-4 h-4 text-gray-900/40 dark:text-white/40 group-hover:text-white dark:group-hover:text-black transition-colors" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Criar meu primeiro projeto</p>
                  <p className="text-xs text-gray-900/40 dark:text-white/40">O contexto do projeto melhora muito os tweets gerados</p>
                </div>
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProject(p)}
                    className={cn(
                      'flex flex-col items-start px-3.5 py-2.5 rounded-xl text-left transition-colors border',
                      selectedProjectId === p.id
                        ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                        : 'bg-transparent border-black/15 dark:border-white/15 hover:border-black/30 dark:hover:border-white/30'
                    )}
                  >
                    <span className={cn('text-sm font-semibold leading-tight', selectedProjectId === p.id ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white')}>
                      {p.name}
                    </span>
                    {p.niche && (
                      <span className={cn('text-[10px] leading-tight mt-0.5', selectedProjectId === p.id ? 'text-white/60 dark:text-black/60' : 'text-gray-900/40 dark:text-white/40')}>
                        {p.niche}
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setShowProjectsModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-dashed border-black/15 dark:border-white/15 text-xs text-gray-900/40 dark:text-white/40 hover:border-black/30 dark:hover:border-white/30 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Novo
                </button>
              </div>
            )}

            {/* Context preview */}
            {selectedProject?.description && (
              <div className="mt-2 px-3 py-2.5 rounded-xl bg-[var(--surface)] border border-black/6 dark:border-white/6">
                <p className="text-[10px] font-semibold text-gray-900/40 dark:text-white/40 uppercase tracking-wider mb-1">Contexto do projeto</p>
                <p className="text-xs text-gray-900/60 dark:text-white/60 line-clamp-2">{selectedProject.description}</p>
                {(selectedProject.audience || selectedProject.niche) && (
                  <p className="text-[10px] text-gray-900/35 dark:text-white/35 mt-1">
                    {[selectedProject.niche, selectedProject.audience && `Público: ${selectedProject.audience}`].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Update textarea */}
          <div>
            <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-2">
              O que aconteceu? O que você quer compartilhar?
            </label>
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
              rows={5}
              placeholder="Ex: Hoje finalizei o onboarding do PostFlow. Levou 3 semanas, muito mais do que esperava. Aprendi que usuários não leem textos — precisei simplificar tudo. Taxa de conclusão foi de 23% para 71%."
              value={update}
              onChange={e => setUpdate(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end mt-1">
              <span className="text-[10px] text-gray-900/30 dark:text-white/30">{update.length} caracteres</span>
            </div>
          </div>

          {/* Extra context */}
          <div>
            <button
              onClick={() => setShowExtra(!showExtra)}
              className="flex items-center gap-1.5 text-xs text-gray-900/40 dark:text-white/40 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors"
            >
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showExtra && 'rotate-180')} />
              Contexto adicional (opcional)
            </button>
            {showExtra && (
              <textarea
                className="mt-2 w-full px-4 py-3 rounded-xl bg-[var(--surface)] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-black/25 dark:focus:border-white/25 transition-colors resize-none"
                rows={3}
                placeholder="Algum detalhe extra que pode ajudar a IA a gerar um tweet melhor..."
                value={extraContext}
                onChange={e => setExtraContext(e.target.value)}
              />
            )}
          </div>

          {/* Tone */}
          <div>
            <label className="block text-xs font-semibold text-gray-900/50 dark:text-white/50 uppercase tracking-wider mb-2">Tom</label>
            <div className="flex flex-wrap gap-2">
              {TONES.map(t => (
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
                  <span className={cn('text-xs font-semibold', selectedTone === t.value ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white')}>{t.label}</span>
                  <span className={cn('text-[10px]', selectedTone === t.value ? 'text-white/70 dark:text-black/70' : 'text-gray-900/40 dark:text-white/40')}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={loading || !update.trim()}
            className="brand-btn primary w-full"
            style={{ padding: '13px 16px', fontSize: 14 }}
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Gerando tweets…
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
              <h2 className="text-sm font-semibold text-gray-900/60 dark:text-white/60 uppercase tracking-wider">Versões geradas</h2>
              <button onClick={handleGenerate} disabled={loading} className="flex items-center gap-1.5 text-xs text-gray-900/40 dark:text-white/40 hover:text-gray-900/60 dark:hover:text-white/60 transition-colors">
                <RefreshCw className="w-3 h-3" /> Gerar novamente
              </button>
            </div>
            {tweets.map((tweet, i) => <TweetCard key={i} tweet={tweet} index={i} />)}
          </div>
        )}

        {!loading && tweets.length === 0 && (
          <div className="mt-10 text-center py-12 border border-dashed border-black/10 dark:border-white/10 rounded-2xl">
            <XIcon className="w-8 h-8 text-gray-900/15 dark:text-white/15 mx-auto mb-3" />
            <p className="text-sm text-gray-900/30 dark:text-white/30">Descreva o que aconteceu e gere seus tweets</p>
          </div>
        )}
      </div>

      {/* Projects modal */}
      {showProjectsModal && (
        <ProjectsModal
          projects={projects}
          onClose={() => setShowProjectsModal(false)}
          onSelect={handleSelectProject}
          onAdd={addProject}
          onUpdate={updateProject}
          onDelete={deleteProject}
        />
      )}
    </div>
  );
}
