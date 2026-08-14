import { createServerSupabaseClient } from '@/lib/supabase-server';
import ChangePasswordButton from '@/components/settings/ChangePasswordButton';

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

      <p className="mt-5 text-xs leading-relaxed text-[var(--ink-dim)]">
        O e-mail da conta é o mesmo do pagamento e não pode ser alterado por aqui. Se
        precisar trocar, fale com o suporte.
      </p>

      {/* Mesma gramática visual do botão de cancelar assinatura na outra aba:
          ação separada do conteúdo por uma linha, no rodapé do cartão. */}
      <div className="mt-5 pt-4 border-t border-[var(--border)]">
        <ChangePasswordButton />
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
