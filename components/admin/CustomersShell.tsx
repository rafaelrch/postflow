'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import type { AdminCustomerFilter, AdminCustomerQuery, AdminCustomerRow, AdminCustomersPageData } from '@/lib/admin-customers';
import { formatCount, formatDateTime, formatMoney } from '@/lib/admin-format';
import RetryPanel from './RetryPanel';
import CustomersSkeleton from './CustomersSkeleton';

const FILTERS: { key: AdminCustomerFilter; label: string; group?: 'interval' | 'status' }[] = [
  { key: 'month', label: 'Mensal', group: 'interval' },
  { key: 'year', label: 'Anual', group: 'interval' },
  { key: 'active', label: 'Ativa', group: 'status' },
  { key: 'past_due', label: 'Past due', group: 'status' },
  { key: 'unpaid', label: 'Unpaid', group: 'status' },
  { key: 'canceled', label: 'Cancelada', group: 'status' },
  { key: 'cancellation_scheduled', label: 'Cancelamento agendado' },
  { key: 'onboarding_incomplete', label: 'Onboarding incompleto' },
  { key: 'no_content', label: 'Sem conteúdo' },
  { key: 'zero_credits', label: 'Créditos zerados' },
  { key: 'paid_without_account', label: 'Pagou sem conta' },
];

function statusLabel(status: string | null): string {
  if (!status) return 'Sem assinatura';
  if (status === 'active') return 'Ativa';
  if (status === 'trialing') return 'Trial';
  if (status === 'canceled') return 'Cancelada';
  return status;
}

function date(value: string | null): string {
  return value ? formatDateTime(value) : '—';
}

function RowDetail({ customer, onClose }: { customer: AdminCustomerRow; onClose: () => void }) {
  const timeline = [
    ['Lead captado', customer.leadCreatedAt],
    ['Checkout iniciado', customer.checkoutCreatedAt],
    ['Pagamento registrado', customer.subscriptionCreatedAt],
    ['Conta vinculada', customer.accountCreatedAt],
    ['Onboarding concluído', customer.onboardingAt],
    ['Primeiro conteúdo', customer.firstContentAt],
  ] as const;

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div className="admin-customer-drawer-wrap">
      <button type="button" className="admin-customer-drawer-backdrop" aria-label="Fechar detalhe" onClick={onClose} />
      <aside className="admin-customer-drawer" role="dialog" aria-modal="true" aria-label={`Detalhes de ${customer.name}`}>
        <header>
          <div><p>Cliente</p><h2>{customer.name}</h2><span>{customer.email}</span></div>
          <button type="button" aria-label="Fechar detalhe" onClick={onClose}><X size={17} /></button>
        </header>

        <section><h3>Conta</h3><dl>
          <div><dt>Cadastro</dt><dd>{date(customer.accountCreatedAt)}</dd></div>
          <div><dt>E-mail confirmado</dt><dd>{date(customer.emailConfirmedAt)}</dd></div>
          <div><dt>Onboarding</dt><dd>{customer.onboardingCompleted === null ? 'Sem conta/perfil' : customer.onboardingCompleted ? 'Concluído' : 'Incompleto'}</dd></div>
        </dl></section>
        <section><h3>Assinatura</h3><dl>
          <div><dt>Plano</dt><dd>{customer.planInterval === 'month' ? 'Mensal' : customer.planInterval === 'year' ? 'Anual' : 'Sem plano'}</dd></div>
          <div><dt>Status</dt><dd>{statusLabel(customer.subscriptionStatus)}</dd></div>
          <div><dt>Valor</dt><dd>{customer.subscriptionValue === null ? '—' : formatMoney(customer.subscriptionValue)}</dd></div>
          <div><dt>Renovação / fim do acesso</dt><dd>{date(customer.accessUntil)}</dd></div>
          <div><dt>Cancelamento agendado</dt><dd>{customer.cancelAtPeriodEnd ? 'Sim' : 'Não'}</dd></div>
        </dl></section>
        <section><h3>Créditos e conteúdo existente hoje</h3><dl>
          <div><dt>Créditos</dt><dd>{customer.creditBalance === null ? '—' : `${formatCount(customer.creditBalance)} / ${formatCount(customer.creditLimit ?? 0)}`}</dd></div>
          <div><dt>Carrosséis</dt><dd>{formatCount(customer.carouselCount)}</dd></div>
          <div><dt>Notícias</dt><dd>{formatCount(customer.newsCount)}</dd></div>
          <div><dt>Agendamentos</dt><dd>{formatCount(customer.scheduledCount)}</dd></div>
        </dl></section>
        <section><h3>Linha do tempo reconstruível</h3><ol className="admin-customer-timeline">
          {timeline.map(([label, value]) => <li key={label} data-known={value ? 'true' : 'false'}><span /><div><strong>{label}</strong><small>{date(value)}</small></div></li>)}
        </ol><p className="admin-customer-note">Só metadados. Nenhum título, texto, prompt ou legenda do cliente é exibido.</p></section>
      </aside>
    </div>
  );
}

function CustomersTable({ rows, onSelect }: { rows: AdminCustomerRow[]; onSelect: (row: AdminCustomerRow) => void }) {
  return <div className="admin-customers-table-scroll"><table className="admin-customers-table">
    <thead><tr><th>Cliente</th><th>Cadastro</th><th>Onboarding</th><th>Plano</th><th>Status</th><th>Valor</th><th>Renovação / acesso</th><th>Cancelamento</th><th>Créditos</th><th>Conteúdo existente hoje</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.customerKey}>
      <td><button type="button" className="admin-customer-open" onClick={() => onSelect(row)}><strong>{row.name}</strong><span>{row.email}</span></button></td>
      <td className="admin-tabular">{date(row.accountCreatedAt)}</td>
      <td>{row.onboardingCompleted === null ? 'Sem conta' : row.onboardingCompleted ? 'Concluído' : 'Incompleto'}</td>
      <td>{row.planInterval === 'month' ? 'Mensal' : row.planInterval === 'year' ? 'Anual' : '—'}</td>
      <td><span className="admin-status-pill" data-status={row.subscriptionStatus ?? 'none'}>{statusLabel(row.subscriptionStatus)}</span></td>
      <td className="admin-tabular">{row.subscriptionValue === null ? '—' : formatMoney(row.subscriptionValue)}</td>
      <td className="admin-tabular">{date(row.accessUntil)}</td>
      <td>{row.cancelAtPeriodEnd ? <span className="admin-status-pill" data-status="scheduled">Agendado</span> : 'Não'}</td>
      <td className="admin-tabular">{row.creditBalance === null ? '—' : `${formatCount(row.creditBalance)} / ${formatCount(row.creditLimit ?? 0)}`}</td>
      <td className="admin-tabular">{row.carouselCount} car. · {row.newsCount} not. · {row.scheduledCount} ag.</td>
    </tr>)}</tbody>
  </table></div>;
}

export default function CustomersShell({ query, data, failed = false }: { query: AdminCustomerQuery; data: AdminCustomersPageData | null; failed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search);
  const [selected, setSelected] = useState<AdminCustomerRow | null>(null);
  const active = useMemo(() => new Set(query.filters), [query.filters]);

  function navigate(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  useEffect(() => setSearch(query.search), [query.search]);
  useEffect(() => {
    if (search.trim() === query.search) return;
    const timer = window.setTimeout(() => navigate((params) => {
      const next = search.trim();
      next ? params.set('q', next) : params.delete('q');
      params.delete('page');
    }), 350);
    return () => window.clearTimeout(timer);
    // navigate intentionally reads the latest URL only when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, query.search]);

  function toggleFilter(filter: (typeof FILTERS)[number]) {
    navigate((params) => {
      const next = new Set(query.filters);
      if (next.has(filter.key)) next.delete(filter.key);
      else {
        if (filter.group) FILTERS.filter((item) => item.group === filter.group).forEach((item) => next.delete(item.key));
        next.add(filter.key);
      }
      params.delete('f');
      next.forEach((item) => params.append('f', item));
      params.delete('page');
    });
  }

  return <div className="admin-customers-shell">
    <section className="admin-customers-topbar" data-pending={pending ? 'true' : 'false'}>
      <div className="admin-section-title"><span className="admin-section-icon"><Users size={16} /></span><div><h1>Clientes</h1><p>Contas, assinaturas e sinais que pedem ação</p></div></div>
      <label className="admin-customer-search"><Search size={15} aria-hidden /><span className="sr-only">Buscar cliente</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por e-mail ou nome" autoComplete="off" /></label>
      <div className="admin-result-count"><strong>{formatCount(data?.total ?? 0)}</strong> resultado(s)</div>
    </section>
    <section className="admin-customer-filters" aria-label="Filtros de clientes"><span><SlidersHorizontal size={14} /> Filtros</span>{FILTERS.map((filter) => <button type="button" key={filter.key} aria-pressed={active.has(filter.key)} onClick={() => toggleFilter(filter)}>{filter.label}</button>)}</section>

    {pending ? <CustomersSkeleton /> : failed || !data ? <RetryPanel message="Não foi possível ler os clientes agora. Nenhum dado foi alterado." /> : data.rows.length === 0 ? <div className="admin-customers-empty"><Users size={22} /><h2>{query.search || query.filters.length ? 'Nenhum cliente com esses filtros' : 'Nenhum cliente cadastrado'}</h2><p>{query.search || query.filters.length ? 'Revise a busca ou remova um filtro para ampliar o resultado.' : 'Quando existir uma conta ou assinatura, ela aparecerá aqui.'}</p></div> : <>
      <CustomersTable rows={data.rows} onSelect={setSelected} />
      <nav className="admin-customers-pagination" aria-label="Paginação"><span>Página {data.page} de {data.totalPages}</span><div><button type="button" disabled={data.page <= 1} aria-label="Página anterior" onClick={() => navigate((params) => { params.set('page', String(data.page - 1)); })}><ChevronLeft size={15} /></button><button type="button" disabled={data.page >= data.totalPages} aria-label="Próxima página" onClick={() => navigate((params) => { params.set('page', String(data.page + 1)); })}><ChevronRight size={15} /></button></div></nav>
    </>}
    {selected && <RowDetail customer={selected} onClose={() => setSelected(null)} />}
  </div>;
}
