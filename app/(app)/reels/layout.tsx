import { redirect } from 'next/navigation';
import { REELS_ENABLED } from '@/lib/feature-flags';

/**
 * Porta de entrada do /reels. Esconder o link na sidebar não basta: quem digita
 * a URL na mão tem que ser desviado ANTES da página quebrada renderizar.
 *
 * O redirect mora aqui, e não em page.tsx, porque este layout é o ponto MAIS
 * ALTO da rota: a decisão acontece antes de a página client ser executada, o
 * que evita rodar os hooks e o setup dela só pra desviar em seguida.
 *
 * Não é por causa do 'use client' da página: `redirect` funciona em Client
 * Component durante a renderização e, na carga inicial via SSR, vira um
 * redirect server-side do mesmo jeito (docs do Next, redirect.md → "Client
 * Component"). A escolha aqui é de ONDE decidir, não de poder ou não decidir.
 *
 * Com REELS_ENABLED ligado este layout é transparente: repassa os children e a
 * página volta a se comportar exatamente como antes.
 */
export default function ReelsLayout({ children }: { children: React.ReactNode }) {
  if (!REELS_ENABLED) {
    redirect('/dashboard');
  }
  return <>{children}</>;
}
