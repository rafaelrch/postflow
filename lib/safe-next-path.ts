/**
 * Sanitiza o `?next=` do /auth/callback contra open redirect.
 *
 * A regra é validar a SAÍDA, não a entrada: inspecionar a string crua com
 * startsWith/regex/blacklist é exatamente como esse bug nasce — sempre falta um
 * vetor (`//evil.com`, `https://evil.com`, `\\evil.com`, `///evil.com`...).
 * Aqui o valor é RESOLVIDO contra a origin com o próprio parser de URL e só é
 * aceito se o URL final continuar na mesma origin.
 *
 * Além da origin, o pathname resolvido não pode começar com `//`: `/..//evil.com`
 * normaliza para o pathname `//evil.com`, que segue same-origin agora mas vira
 * protocol-relative (`//evil.com` = `https://evil.com`) se for reserializado
 * como string adiante.
 *
 * Escolha: query e hash internos legítimos são preservados (ex.: `/conta?tab=plano`),
 * porque o fluxo de confirmação de e-mail precisa levar a pessoa ao ponto exato
 * de onde saiu. Eles só sobrevivem depois de o URL inteiro passar na validação.
 */
export const DEFAULT_NEXT_PATH = '/dashboard';

export function safeNextPath(rawNext: string | null | undefined, origin: string): string {
  if (!rawNext) return DEFAULT_NEXT_PATH;

  let base: URL;
  let resolved: URL;
  try {
    base = new URL(origin);
    resolved = new URL(rawNext, base);
  } catch {
    return DEFAULT_NEXT_PATH;
  }

  if (resolved.origin !== base.origin) return DEFAULT_NEXT_PATH;
  if (resolved.pathname.startsWith('//')) return DEFAULT_NEXT_PATH;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
