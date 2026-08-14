import { createServerSupabaseClient } from '@/lib/supabase-server';
import ChangePasswordForm from '@/components/settings/ChangePasswordForm';

/**
 * Aba "Conta": os dados que a conta REALMENTE tem, e a troca de senha.
 *
 * O e-mail é só leitura porque trocar e-mail não é um fluxo que exista hoje —
 * mudaria a chave que liga a conta ao pagamento (o webhook casa por
 * lower(email)) e precisa de confirmação nos dois endereços. Um campo editável
 * aqui prometeria algo que nada implementa.
 *
 * Nome e criação saem de public.profiles / auth.users. Nenhum campo é inventado:
 * o que não existe no banco não aparece na tela.
 */

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

export default async function ConfiguracoesContaPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A linha de profiles pode não existir (conta antiga, trigger que falhou):
  // maybeSingle + optional chaining, nunca um throw que derruba a aba inteira.
  const { data: profile } = user
    ? await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle()
    : { data: null };

  const nome = (profile as { name?: string } | null)?.name?.trim();

  return (
    <div>
      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Dados da conta</h2>

        <div className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--ink-dim)]">E-mail</span>
            <span className="font-medium truncate" data-testid="conta-email">{user?.email ?? '—'}</span>
          </div>
          {/* Só aparece quando existe: uma linha "Nome —" não informa nada. */}
          {nome ? (
            <div className="flex justify-between gap-4">
              <span className="text-[var(--ink-dim)]">Nome</span>
              <span className="font-medium truncate" data-testid="conta-nome">{nome}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <span className="text-[var(--ink-dim)]">Conta criada em</span>
            <span className="font-medium" data-testid="conta-criada-em">{fmtDate(user?.created_at)}</span>
          </div>
        </div>

        <p className="mt-4 text-xs text-[var(--ink-dim)]">
          O e-mail da conta é o mesmo do pagamento e não pode ser alterado por aqui. Se
          precisar trocar, fale com o suporte.
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Trocar a senha</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
