/**
 * Chaves de funcionalidade do produto.
 *
 * São CONSTANTES de propósito, não variáveis de ambiente: ligar/desligar uma
 * funcionalidade é uma mudança de código que passa por review e fica no
 * histórico do git — não um toggle invisível no painel da Vercel.
 *
 * Regra da casa: desligar NUNCA apaga nada. Página, componentes, libs, rota de
 * API, bucket e schema continuam no lugar. Religar é trocar `false` por `true`
 * aqui e mais nada.
 */

/**
 * Reels. DESLIGADO em 30/07/2026 (decisão do Rafael): o export tem 2 bugs
 * abertos e a funcionalidade não vai ser vendida nesta versão. Volta numa
 * próxima atualização.
 *
 * Com a chave em `false`:
 *   - o item some da navegação            → components/ui/AppSidebar.tsx
 *   - GET /reels redireciona pro dashboard → app/(app)/reels/layout.tsx
 *   - POST /api/reels/upload-url dá 404     → app/api/reels/upload-url/route.ts
 *
 * O tipo é `boolean` (e não o literal `false`) de propósito: sem isso o
 * TypeScript estreita a constante e passa a tratar todo ramo "ligado" como
 * código morto, o que quebraria os testes de reversibilidade.
 */
export const REELS_ENABLED: boolean = false;

/**
 * Atelier (o estilo `editorial`). DESLIGADO em 02/09/2026 (decisão do Rafael):
 * o template tem bugs abertos e sai da oferta até ser consertado. Volta num
 * ciclo futuro — é desativação, não remoção.
 *
 * Com a chave em `false`:
 *   - o card some do grid de templates do wizard → components/editor/CreateWizard.tsx
 *
 * Só a OFERTA de criar um Atelier novo sai. Carrossel `editorial` já salvo
 * continua abrindo, editando e exportando: o estilo segue em `SlideStyle`
 * (types/index.ts), no schema, no EditorialSlide, nos painéis da sidebar e no
 * corner-placeholder. Mesma situação do `minimalist`, que existe no editor sem
 * ser oferecido no wizard.
 *
 * O tipo é `boolean` (e não o literal `false`) de propósito: sem isso o
 * TypeScript estreita a constante e passa a tratar todo ramo "ligado" como
 * código morto, o que quebraria os testes de reversibilidade.
 */
export const ATELIER_ENABLED: boolean = false;
