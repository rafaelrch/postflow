# Bug: `loading.tsx` + `await fetch()` deixa a tela no esqueleto para sempre

**Next 16.2.1 e 16.2.10 (Turbopack). Dev e produção, igual.**

Um Server Component que faz `fetch` de rede debaixo de um boundary de Suspense
criado por `loading.tsx` **nunca tem o boundary resolvido no cliente**. O HTML
chega inteiro — o conteúdo fica no `<div id="S:…">` de staging com
`display:none` —, o `<template id="B:…">` continua pendente e o swap nunca
acontece. O usuário vê o esqueleto para sempre.

No produto isso mata três telas: `/dashboard`, `/agenda` e `/conta` — as três
que têm `loading.tsx`. `/news`, que não tem, funciona.

## Repro mínimo

```tsx
// app/x/loading.tsx
export default function L() { return <p id="esqueleto">ESQUELETO</p>; }

// app/x/page.tsx
export default async function Page() {
  const r = await fetch('https://<host>/qualquer', { cache: 'no-store' });
  return <p id="conteudo-real">OK {r.status}</p>;
}
```

Abrir `/x`: o esqueleto fica para sempre. Trocar o `fetch` por
`await new Promise(r => setTimeout(r, 300))`: resolve normalmente.

## Como medir (importante)

Medir **visibilidade**, nunca presença no DOM — o conteúdo ESTÁ no DOM, dentro
da área de staging escondida, e `querySelector` o encontra. Isso já nos custou
dois diagnósticos errados.

```js
const vis = (el) => !!el && !!el.offsetParent &&
  el.getBoundingClientRect().width > 0;
vis(document.querySelector('#conteudo-real'));            // false quando travado
!!document.querySelector("template[id^='B:']");           // true = boundary pendente
```

## Matriz medida

| cenário | `loading.tsx` | trabalho no servidor | resolve? |
|---|---|---|---|
| espera artificial | sim | `setTimeout(300ms)` | **sim** |
| espera artificial, dentro do layout cliente | sim | `setTimeout(300ms)` | **sim** |
| página sem I/O | sim | nenhum | **sim** |
| 1 query supabase | sim | `fetch` (supabase-js) | **não** |
| `fetch` cru | sim | `fetch` `no-store` | **não** |
| `fetch` cru, fora do layout cliente | sim | `fetch` `no-store` | **não** |
| Suspense **aninhado** dentro da page | sim | `fetch` `no-store` | **não** (o de fora resolve, o de dentro trava) |
| `fetch` com `force-cache`, rota **estática** | sim | fetch no BUILD | **sim** (não há fetch em runtime) |
| `fetch` com `force-cache`, rota **dinâmica** (`cookies()`) | sim | `fetch` em runtime | **não** |
| dashboard real, **sem** `loading.tsx` | não | supabase completo | **sim** |

## Descartado com experimento

- **Conteúdo do `loading.tsx`** — trocado por `<p>Carregando…</p>`: trava igual.
- **`proxy.ts`** — renomeado para `.off`: trava igual (testado no repro mínimo
  e no `/dashboard`).
- **Layout cliente do `(app)`** — a mesma rota fora do grupo: trava igual.
- **supabase-js** — `fetch` cru sem supabase: trava igual.
- **Versão** — Next **16.2.1** falha igual ao 16.2.10, com o controle
  (`setTimeout`) passando na mesma porta. Voltar patch não resolve.
- **Turbopack/dev** — build de produção (`next start`) falha igual.
- **Cache do `.next`** — build limpo em cópia nova: trava igual.

## Único contorno provado

Remover o `loading.tsx` da rota. O `/dashboard` real (com supabase) passa a
renderizar: 10 cards visíveis, paginação visível. Custo: a tela perde o
esqueleto de carregamento.

Os dois contornos que preservariam o esqueleto **não servem**:

- **Suspense aninhado** não resolve — o problema só migra para o boundary de
  dentro, e o conteúdo continua sem aparecer.
- **`fetch` cacheado** só resolve quando a rota inteira vira estática. As nossas
  leem `cookies()` por causa do RLS, então são dinâmicas por construção: nunca
  vão para esse caminho, e forçá-las seria servir dados de um usuário para
  outro.
