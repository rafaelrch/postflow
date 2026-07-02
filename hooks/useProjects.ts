'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';

export interface Project {
  id: string;
  name: string;
  description: string;
  niche?: string;
  audience?: string;
  defaultTone?: string;
  createdAt: string;
}

const SELECT = 'id, name, description, niche, audience, default_tone, created_at';
// Chave antiga (projetos viviam só no navegador). Mantida para migrar dados
// existentes para o Supabase na primeira carga.
const LEGACY_STORAGE_KEY = 'postflow_projects';

type DbRow = {
  id: string;
  name: string;
  description: string;
  niche: string;
  audience: string;
  default_tone: string;
  created_at: string;
};

function mapRow(row: DbRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    niche: row.niche || undefined,
    audience: row.audience || undefined,
    defaultTone: row.default_tone || undefined,
    createdAt: row.created_at,
  };
}

/**
 * Projetos do usuário na tabela `projects` do Supabase (RLS garante que cada
 * conta só vê os próprios). Substitui o antigo armazenamento em localStorage.
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const load = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(SELECT)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      if (!active) return;
      if (error) {
        console.error('[useProjects] load', error);
        setLoading(false);
        return;
      }

      let list = ((data as DbRow[]) || []).map(mapRow);

      // Migração one-time: importa projetos antigos do localStorage para o banco.
      if (list.length === 0) {
        try {
          const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
          const legacy: Project[] = raw ? JSON.parse(raw) : [];
          if (Array.isArray(legacy) && legacy.length > 0) {
            const { data: inserted } = await supabase
              .from('projects')
              .insert(legacy.map((p) => ({
                name: p.name || 'Projeto',
                description: p.description || '',
                niche: p.niche || '',
                audience: p.audience || '',
                default_tone: p.defaultTone || '',
              })))
              .select(SELECT);
            if (inserted?.length) {
              list = (inserted as DbRow[]).map(mapRow);
              localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
          }
        } catch { /* localStorage indisponível — segue sem migrar */ }
      }

      if (active) {
        setProjects(list);
        setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, []);

  const addProject = useCallback(async (data: Omit<Project, 'id' | 'createdAt'>): Promise<Project> => {
    const supabase = createClient();
    const { data: row, error } = await supabase
      .from('projects')
      .insert({
        name: data.name,
        description: data.description || '',
        niche: data.niche || '',
        audience: data.audience || '',
        default_tone: data.defaultTone || '',
      })
      .select(SELECT)
      .single();
    if (error || !row) throw new Error(error?.message || 'Falha ao criar projeto');
    const project = mapRow(row as DbRow);
    setProjects((prev) => [...prev, project]);
    return project;
  }, []);

  const updateProject = useCallback(async (id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>) => {
    const supabase = createClient();
    const payload: Record<string, string> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.niche !== undefined) payload.niche = data.niche || '';
    if (data.audience !== undefined) payload.audience = data.audience || '';
    if (data.defaultTone !== undefined) payload.default_tone = data.defaultTone || '';

    const { error } = await supabase.from('projects').update(payload).eq('id', id);
    if (error) throw new Error(error.message || 'Falha ao atualizar projeto');
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Falha ao remover projeto');
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, loading, addProject, updateProject, deleteProject };
}
