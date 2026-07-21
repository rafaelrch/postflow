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
 * Não basta checar a ENTRADA: `?next=/..//evil.com` resolve com origem interna
 * (o `..` consome o primeiro segmento), mas o pathname normalizado vira
 * `//evil.com`. Reconstruído no ponto de uso (`new URL(path, origin)` ou
 * `router.replace(path)`) isso é protocol-relative e sai do domínio. Por isso
 * revalidamos a SAÍDA: o caminho final é resolvido de novo contra a base e a
 * origem reconferida.
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
  if (!path.startsWith('/')) return fallback;

  // Revalida a saída: `//evil.com` ou `/\evil.com` (via barra invertida ou via
  // `..` que comeu o primeiro segmento) mantêm a origem interna aqui, mas viram
  // protocol-relative quando reconstruídos no ponto de uso. Resolver o caminho
  // final de novo contra a base expõe o escape — a origem deixa de bater.
  let resolved: URL;
  try {
    resolved = new URL(path, SYNTHETIC_BASE);
  } catch {
    return fallback;
  }
  if (resolved.origin !== SYNTHETIC_BASE) return fallback;

  return path;
}
