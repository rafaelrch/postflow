import { redirect } from 'next/navigation';

/**
 * /configuracoes sozinho não é uma tela: escolhe a primeira aba.
 *
 * Vai para "Assinatura" porque é o que a antiga /conta mostrava — quem chega
 * pela sidebar continua vendo o que via antes. Aqui é `redirect` (307) e não
 * `permanentRedirect`: /configuracoes é um endereço válido e pode ganhar uma
 * tela própria depois; um 308 ficaria cacheado no navegador do cliente para
 * sempre.
 */
export default function ConfiguracoesPage() {
  redirect('/configuracoes/assinatura');
}
