'use client';

import { useLinkStatus } from 'next/link';

/**
 * Indicador de NAVEGAÇÃO PENDENTE — o "carregando" do produto.
 *
 * Qual espera ele cobre, e por que é esta: as três telas (dashboard, agenda,
 * conta) têm `page.tsx` assíncrono, então o HTML só chega DEPOIS dos dados. No
 * intervalo entre o clique e a chegada, o navegador continua exibindo a tela
 * ANTERIOR, parada. Sem sinal nenhum ali, o clique parece ter falhado. É esse
 * o vão que este componente preenche — do clique até o conteúdo.
 *
 * 🔴 Por que NÃO é um `loading.tsx`: `loading.tsx` numa rota cujo Server
 * Component faz `fetch` deixa o boundary pendente para sempre nesta versão do
 * Next — o defeito que matou estas mesmas três telas. Ver
 * `docs/bug-loading-fetch-next16.md`. Este caminho é de cliente e não cria
 * boundary de rota nenhum, então não pode reintroduzir aquilo.
 *
 * `useLinkStatus` é a ferramenta que a doc local indica para exatamente este
 * caso: rota dinâmica e sem `loading.js`, em que a navegação fica bloqueada.
 * Ele só funciona dentro de um descendente de `<Link>`.
 */
export default function NavPending() {
  const { pending } = useLinkStatus();

  return (
    // Tamanho FIXO e sempre renderizado, alternando só a opacidade: é o que a
    // doc recomenda para o indicador não empurrar o layout ao aparecer.
    //
    // 🔴 A opacidade sai do CSS, por `data-pendente`, NUNCA de estilo inline
    // aqui. Inline perde para animação em execução: quando a regra da animação
    // escapou para a base, os keyframes atropelaram o `opacity: 0` e os cinco
    // itens do menu pulsaram laranja o tempo todo. Uma fonte de verdade só.
    <span
      aria-hidden
      data-pendente={pending ? 'true' : 'false'}
      className="nav-pending shrink-0 w-3 h-3 rounded-full"
    />
  );
}
