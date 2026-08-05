'use client';

import { Children, ReactNode } from 'react';
import SidebarScopeHeader from './SidebarScopeHeader';

/**
 * Bloco de painéis que compartilham o mesmo escopo.
 *
 * Não renderiza nada quando não sobrou painel aplicável. Isso não é detalhe: a
 * composição por template é condicional, e um grupo que renderiza só o próprio
 * cabeçalho deixa na tela um "ESTILO GLOBAL" sem nada embaixo — que o usuário
 * lê como painel que sumiu, não como grupo vazio.
 */
export default function SidebarGroup({
  label,
  hint,
  value,
  info,
  children,
}: {
  /** Ausente = grupo sem cabeçalho (o bloco do topo, nível post). */
  label?: string;
  hint?: string;
  value?: string;
  info?: string;
  children: ReactNode;
}) {
  // `Children.toArray` já descarta null/false/undefined — que é como as
  // condicionais de template chegam aqui.
  const panels = Children.toArray(children);
  if (panels.length === 0) return null;

  return (
    <div className="pb-1">
      {label && <SidebarScopeHeader label={label} hint={hint} value={value} info={info} />}
      {panels}
    </div>
  );
}
