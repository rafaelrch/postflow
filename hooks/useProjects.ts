import { useState, useEffect, useCallback } from 'react';

export interface Project {
  id: string;
  name: string;
  description: string;
  niche?: string;
  audience?: string;
  defaultTone?: string;
  createdAt: string;
}

const STORAGE_KEY = 'postflow_projects';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setProjects(JSON.parse(stored));
    } catch {}
  }, []);

  const persist = (list: Project[]) => {
    setProjects(list);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
  };

  const addProject = useCallback((data: Omit<Project, 'id' | 'createdAt'>) => {
    const project: Project = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    persist([...projects, project]);
    return project;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const updateProject = useCallback((id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>) => {
    persist(projects.map(p => p.id === id ? { ...p, ...data } : p));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const deleteProject = useCallback((id: string) => {
    persist(projects.filter(p => p.id !== id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  return { projects, addProject, updateProject, deleteProject };
}
