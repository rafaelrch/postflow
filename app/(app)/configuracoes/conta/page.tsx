import { createServerSupabaseClient } from '@/lib/supabase-server';
import ChangePasswordButton from '@/components/settings/ChangePasswordButton';
import ChangeEmailButton from '@/components/settings/ChangeEmailButton';

/**
 * Aba "Conta": os dados que a conta REALMENTE tem, a troca de senha e a troca
 * de e-mail.
 *
 * ── O E-MAIL AGORA É TROCÁVEL, E POR QUAL CAMINHO ───────────────────────────
 * Pelo fluxo nativo do Supabase, com confirmação: a rota /api/conta/email só
 * PEDE a troca, e o endereço muda quando o link é aberto. Nada aqui escreve em
 * `auth.users.email` — ver lib/account-email-change.ts.
 *
 * O `lower(email)` que liga conta e pagamento vale ANTES de a conta existir (o
 * gate de cadastro e o claim). Depois do claim o vínculo é `user_id`, então
 * trocar o e-mail do Auth não desliga assinatura, crédito nem renovação, e
 * `subscriptions.email` — que é o e-mail de quem PAGOU — segue intocado.
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
    /*
      UM cartão só, e a aba cabe na janela sem rolagem (medida a 1280×720).
      Antes eram dois empilhados — "Dados da conta" e o formulário de senha
      inteiro aberto —, e o segundo empurrava a página para além da dobra para
      mostrar algo que quase nunca é usado. A senha agora mora atrás do botão.

      Os dados vão em DUAS COLUNAS a partir de sm: são três valores curtos, e a
      lista de linhas inteiras deixava metade do cartão vazia à direita.
    */
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
      <h2 className="text-lg font-semibold text-[var(--foreground)]">Dados da conta</h2>

      <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Dado rotulo="E-mail" testId="conta-email" valor={user?.email ?? '—'} />
        {/* Só aparece quando existe: uma linha "Nome —" não informa nada. */}
        {nome ? <Dado rotulo="Nome" testId="conta-nome" valor={nome} /> : null}
        <Dado rotulo="Conta criada em" testId="conta-criada-em" valor={fmtDate(user?.created_at)} />
      </dl>

      {/* Mesma gramática visual do botão de cancelar assinatura na outra aba:
          ação separada do conteúdo por uma linha, no rodapé do cartão. */}
      <div className="mt-5 pt-4 border-t border-[var(--border)] flex flex-col items-start">
        {/* `new_email` é o pedido de troca ainda não confirmado. Vem do
            servidor para sobreviver a recarga e a outro dispositivo. */}
        <ChangeEmailButton
          currentEmail={user?.email ?? '—'}
          pendingEmail={(user as { new_email?: string | null } | null)?.new_email?.trim() || null}
        />
        <div className="mt-3">
          <ChangePasswordButton />
        </div>
      </div>
    </section>
  );
}

/** Um par rótulo/valor da grade. O valor trunca em vez de esticar o cartão. */
function Dado({ rotulo, valor, testId }: { rotulo: string; valor: string; testId: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--ink-dim)]">{rotulo}</dt>
      <dd className="mt-1 text-sm font-medium truncate" title={valor} data-testid={testId}>
        {valor}
      </dd>
    </div>
  );
}
