# Ajuste de revisão — `ImageShape` está no lugar errado

Achado meu revisando a rodada 2. Pequeno, mas é direção de dependência invertida.

`hooks/useGenerateCarouselImages.tsx` começa com `'use client'`. E hoje dois
módulos de SERVIDOR importam um tipo de lá:

    lib/openai.ts:2                    import type { ImageShape } from '@/hooks/useGenerateCarouselImages';
    app/api/generate-image/route.ts:5  import type { ImageShape } from '@/hooks/useGenerateCarouselImages';

Como é `import type`, some na compilação e hoje não quebra nada — o `tsc` passa e
o bundle do servidor não leva o hook. O problema é o precedente: o servidor
passou a apontar para um módulo cliente, e no dia em que alguém precisar de um
VALOR desse arquivo (não só o tipo) o import deixa de ser apagado e arrasta o
hook, o `useEditorStore` e o react-hot-toast para dentro do servidor. É barato
consertar agora e caro descobrir depois.

## O que fazer
1. Mova o tipo `ImageShape` para `types/index.ts`, junto dos outros tipos
   compartilhados de slide/deck.
2. `hooks/useGenerateCarouselImages.tsx` importa `ImageShape` de `@/types` e
   pode continuar re-exportando (`export type { ImageShape }`) se algum
   componente já usa o caminho antigo — mas `lib/openai.ts` e
   `app/api/generate-image/route.ts` passam a importar de `@/types`.
3. Confira se `GenerateOptions` tem o mesmo problema: hoje só
   `components/editor/sidebar/AiGenPanel.tsx` importa, que é cliente, então está
   OK e NÃO precisa mudar. Não mexa nele.
4. Não mude comportamento nenhum. É só o endereço do tipo.

## Verificação
- `npx tsc --noEmit` limpo.
- `npx vitest run --exclude "**/.claude/worktrees/**"`: tem que continuar
  `2 failed | 1595 passed`. Se algum mock de teste apontava para o caminho
  antigo, ajuste o mock.
- Não commite, não faça push.

## Ao terminar
maestri ask "Orquestrador" "<o que mudou e a saida do tsc e do vitest>"
