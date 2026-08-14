import { permanentRedirect } from 'next/navigation';

/**
 * /conta VIROU REDIRECT — o conteúdo mudou para /configuracoes/assinatura.
 *
 * A rota continua existindo de propósito: este endereço já circulou em e-mail,
 * pode estar em aba aberta de cliente e era o destino do badge da sidebar.
 * Apagá-la transformaria tudo isso em 404 para quem paga.
 *
 * `permanentRedirect` (308) e não `redirect` (307): a mudança é definitiva, e o
 * 308 é o que faz navegador e crawler passarem a ir direto ao novo endereço.
 */
export default function ContaPage() {
  permanentRedirect('/configuracoes/assinatura');
}
