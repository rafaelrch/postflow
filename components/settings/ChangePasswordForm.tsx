'use client';

import { useState } from 'react';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import {
  PASSWORD_MIN,
  PASSWORD_MAX,
  isPasswordLengthInvalid,
  passwordLengthMessage,
} from '@/lib/password-rules';

/**
 * Trocar a senha estando logado.
 *
 * ⚠️ A SENHA ATUAL É OBRIGATÓRIA, e não é burocracia: sem ela, quem sentar no
 * computador destravado de um cliente troca a senha e toma a conta — a sessão
 * já está de pé, o Supabase aceitaria o updateUser sozinho. Pedir a senha atual
 * transforma "ter o computador" em "saber a senha".
 *
 * A validação é uma REAUTENTICAÇÃO de verdade (signInWithPassword com o e-mail
 * da própria sessão), não uma comparação nossa: só o Supabase sabe o hash. Se a
 * senha estiver errada, o sign-in falha e nada é alterado — e a sessão atual
 * continua intacta, porque supabase-js só troca a sessão quando o login dá
 * certo.
 *
 * O e-mail NÃO é digitado aqui: sai de getUser(). Um campo de e-mail nesta tela
 * viraria um oráculo de "esta senha vale para este endereço?" para quem já
 * sentou na máquina.
 *
 * Fluxo todo no cliente de propósito. Uma rota de servidor teria de reautenticar
 * em um cliente isolado e trocar a senha por ali — e o refresh token do
 * navegador poderia ser revogado no meio, deslogando a pessoa como efeito
 * colateral de trocar a senha. Aqui o próprio cliente do navegador atualiza a
 * sessão dele, que é o que mantém a pessoa logada.
 */
export default function ChangePasswordForm() {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    setErro(null);

    if (isPasswordLengthInvalid(nova)) {
      setErro(passwordLengthMessage());
      return;
    }
    if (nova !== confirmacao) {
      setErro('A nova senha e a confirmação não conferem.');
      return;
    }
    if (nova === atual) {
      setErro('A nova senha precisa ser diferente da atual.');
      return;
    }

    setEnviando(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      if (!email) {
        setErro('Sua sessão expirou. Entre de novo para trocar a senha.');
        return;
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: atual,
      });
      if (reauthError) {
        // Mensagem sobre a SENHA, nunca sobre a conta: aqui o e-mail já é
        // conhecido, e falar de e-mail em erro de senha é o hábito que vaza
        // existência de conta nas telas onde ele é digitado.
        setErro('A senha atual está incorreta.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: nova });
      if (updateError) {
        setErro('Não foi possível trocar a senha agora. Tente de novo em instantes.');
        return;
      }

      setPronto(true);
      setAtual('');
      setNova('');
      setConfirmacao('');
    } catch {
      setErro('Não foi possível trocar a senha agora. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div className="mt-4 flex items-start gap-3" data-testid="senha-trocada">
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">Senha alterada.</p>
          {/* Dizer que continua logada é parte do pedido: trocar a senha não
              pode parecer que derrubou a sessão. */}
          <p className="mt-1 text-xs text-[var(--ink-dim)]">
            Você continua conectado neste dispositivo. Na próxima vez que entrar, use a
            senha nova.
          </p>
          <button
            type="button"
            className="brand-btn ghost sm mt-3"
            onClick={() => setPronto(false)}
          >
            Trocar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4" data-testid="form-trocar-senha">
      <Campo
        id="senha-atual"
        label="Senha atual"
        value={atual}
        onChange={setAtual}
        autoComplete="current-password"
        placeholder="sua senha de hoje"
      />
      <Campo
        id="senha-nova"
        label="Nova senha"
        value={nova}
        onChange={setNova}
        autoComplete="new-password"
        placeholder={`de ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres`}
      />
      <Campo
        id="senha-confirmacao"
        label="Confirmar nova senha"
        value={confirmacao}
        onChange={setConfirmacao}
        autoComplete="new-password"
        placeholder="repita a nova senha"
      />

      {erro && (
        <p
          data-testid="erro-trocar-senha"
          role="alert"
          className="text-[13px] leading-relaxed rounded-[10px] p-3"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}
        >
          {erro}
        </p>
      )}

      <button
        type="submit"
        data-testid="salvar-senha"
        disabled={enviando}
        className="brand-btn primary self-start"
      >
        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {enviando ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
}) {
  return (
    <div>
      <label className="section-kicker block mb-2" htmlFor={id}>{label}</label>
      <div className="relative">
        <Lock
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: 'var(--ink-dim)' }}
        />
        <input
          id={id}
          data-testid={id}
          type="password"
          className="brand-input"
          style={{ paddingLeft: 40 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
        />
      </div>
    </div>
  );
}
