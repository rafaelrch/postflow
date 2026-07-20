/**
 * Normaliza o destino de `?next=` para um caminho garantidamente interno.
 *
 * Sem isso, `?next=https://evil.com` (ou `//evil.com`, ou `/\evil.com`) leva o
 * usuário para fora do domínio logo após autenticar — open redirect clássico,
 * usado para phishing porque o link parte de um domínio legítimo.
 *
 * A checagem é por ORIGEM, não por formato: o valor é resolvido contra uma
 * base sintética e, se o resultado escapar dela, foi absoluto ou
 * protocol-relative e é descartado.
 *
 * Por que não o padrão de proxy.ts:51 (atribuir a `url.pathname`): ele protege
 * o redirect do servidor, mas deixa `//evil.com` como pathname literal — e no
 * cliente `router.replace('//evil.com')` é protocol-relative, então ainda sai
 * do domínio. Além disso a atribuição escapa `?`, transformando
 * `/onboarding?x=1` em `/onboarding%3Fx=1` e quebrando o destino (proxy.ts não
 * sofre com isso porque zera `url.search` logo depois).
 */
const SYNTHETIC_BASE = 'https://internal.invalid';

export function safeNextPath(
  next: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!next) return fallback;

  let url: URL;
  try {
    url = new URL(next, SYNTHETIC_BASE);
  } catch {
    return fallback;
  }

  // Absoluto para outro host, protocol-relative, ou esquema exótico
  // (javascript:, data:) — todos saem da base sintética.
  if (url.origin !== SYNTHETIC_BASE) return fallback;

  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith('/') ? path : fallback;
}
