'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Lock, Loader2 } from 'lucide-react';
import {
  establishRecoverySession,
  type RecoveryClient,
  type RecoverySessionResult,
} from '@/lib/recovery-callback';
import {
  PASSWORD_MIN,
  PASSWORD_MAX,
  isPasswordLengthInvalid,
  passwordLengthMessage,
} from '@/lib/password-rules';

/**
 * Aterrissagem do link de recuperação: grava a senha nova.
 *
 * ⚠️ ESTA TELA NÃO PODE SER PROTEGIDA POR SESSÃO NO SERVIDOR. O Supabase manda
 * a sessão no FRAGMENTO (#access_token…&type=recovery), e fragmento não é
 * enviado ao servidor — qualquer decisão server-side veria um visitante
 * anônimo e o mandaria para o login com o link já queimado. Quem troca o
 * fragmento por sessão é o JS desta página, via establishRecoverySession
 * (lib/recovery-callback.ts). Mesmo padrão do /definir-senha do cadastro pago,
 * com módulo separado — ver o cabeçalho de lib/recovery-callback.ts.
 *
 * Fora do grupo (app), então sem sidebar e sem AuthProvider: quem chega aqui
 * está, por definição, sem conseguir entrar.
 */
export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [validando, setValidando] = useState(true);
  const [valido, setValido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const clientRef = useRef<RecoveryClient | null>(null);
  /**
   * A PROMESSA da validação, não um "já comecei": no StrictMode a segunda
   * montagem sairia por um guard booleano sem se pendurar em nada, e a tela
   * ficaria validando para sempre. Mesmo padrão do /definir-senha.
   */
  const validacaoRef = useRef<Promise<RecoverySessionResult | null> | null>(null);

  useEffect(() => {
    let ativo = true;
    if (!validacaoRef.current) {
      validacaoRef.current = establishRecoverySession(window.location.hash, {
        clearHash: () => {
          window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}${window.location.search}`,
          );
        },
      });
    }

    void validacaoRef.current.then((resultado) => {
      if (!ativo) return;
      clientRef.current = resultado?.client ?? null;
      setValido(Boolean(resultado));
      setValidando(false);
    });

    return () => { ativo = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    setErro(null);

    if (isPasswordLengthInvalid(senha)) {
      setErro(passwordLengthMessage());
      return;
    }
    if (senha !== confirmacao) {
      setErro('A senha e a confirmação não conferem.');
      return;
    }

    setEnviando(true);
    try {
      const client = clientRef.current;
      if (!client) {
        setErro('Seu link expirou. Peça um novo em "Esqueci minha senha".');
        return;
      }
      const { error } = await client.auth.updateUser({ password: senha });
      if (error) {
        setErro('Não foi possível salvar a senha. Peça um link novo e tente de novo.');
        return;
      }
      // A sessão da recuperação já está de pé em cookie: a pessoa entra direto,
      // sem ter de digitar a senha que acabou de criar.
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setErro('Não foi possível salvar a senha. Peça um link novo e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10" style={{ background: 'var(--paper)' }}>
      <Link href="/" className="flex items-center" aria-label="Creatools">
        <Image
          src="/LOGO_SEMFUNDO.png"
          alt="Creatools"
          width={268}
          height={80}
          priority
          className="h-16 w-auto object-contain dark:invert"
        />
      </Link>

      <div className="flex-1 w-full flex items-center justify-center">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 text-center">
            <h1 className="section-title" style={{ fontSize: 40 }}>Nova senha</h1>
          </div>

          {validando ? (
            <div className="brand-card flex items-center gap-3" style={{ padding: 24 }} data-testid="redefinir-validando">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--ink-dim)' }} />
              <p className="text-[14px]" style={{ color: 'var(--ink-dim)' }}>Validando seu link…</p>
            </div>
          ) : !valido ? (
            <div className="brand-card flex flex-col gap-4" style={{ padding: 24 }} data-testid="redefinir-link-invalido">
              <p className="text-[14px] leading-6" style={{ color: 'var(--ink-dim)' }}>
                Este link não vale mais. Links de redefinição expiram e só podem ser usados
                uma vez — peça um novo e use o mais recente que chegar.
              </p>
              <Link href="/recuperar-senha" className="brand-btn accent w-full justify-center">
                Pedir um link novo
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="brand-card flex flex-col gap-4" style={{ padding: 20 }} data-testid="redefinir-form">
              <Campo
                id="nova-senha"
                label="Nova senha"
                value={senha}
                onChange={setSenha}
                placeholder={`de ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres`}
              />
              <Campo
                id="nova-senha-confirmacao"
                label="Confirmar senha"
                value={confirmacao}
                onChange={setConfirmacao}
                placeholder="repita a senha"
              />

              {erro && (
                <p
                  data-testid="redefinir-erro"
                  role="alert"
                  className="text-[13px] leading-relaxed rounded-[10px] p-3"
                  style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}
                >
                  {erro}
                </p>
              )}

              <button
                type="submit"
                data-testid="redefinir-salvar"
                disabled={enviando}
                className="brand-btn primary w-full justify-center mt-1"
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {enviando ? 'Salvando…' : 'Salvar e entrar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
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
          autoComplete="new-password"
          required
        />
      </div>
    </div>
  );
}
