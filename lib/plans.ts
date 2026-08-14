/**
 * Fonte ÚNICA dos planos: preço, ciclo, rótulo e texto do item de checkout.
 *
 * Antes disso o preço vivia escrito à mão em app/(marketing)/precos/page.tsx
 * (MONTHLY_PRICE/YEARLY_PRICE) e o valor cobrado seria escrito de novo na rota
 * de checkout. Dois lugares para o mesmo número é como se cobra um valor
 * diferente do anunciado. Aqui a UI e a rota leem o MESMO objeto.
 *
 * Módulo isomórfico de propósito: não lê env nem importa nada de servidor, para
 * poder ser importado tanto pela página de preços quanto pela rota de checkout.
 */

export type PlanInterval = 'month' | 'year';

/** Ciclo no vocabulário do Asaas (subscription.cycle em POST /v3/checkouts). */
export type AsaasCycle = 'MONTHLY' | 'YEARLY';

export interface Plan {
  interval: PlanInterval;
  /** Valor cobrado, em reais. É ISTO que vai para o Asaas em items[].value. */
  value: number;
  cycle: AsaasCycle;
  /** Rótulo curto do plano ("Mensal"/"Anual"). */
  label: string;
  /** Preço já formatado para exibição. Deriva de `value` — não digite outro número. */
  priceLabel: string;
  /** items[].name do checkout. A doc limita a 30 caracteres. */
  itemName: string;
  /** items[].description do checkout. A doc limita a 150 caracteres. */
  itemDescription: string;
  /**
   * DESCRIÇÃO DA COBRANÇA — o texto que o cliente vê na fatura e no e-mail do
   * Asaas. A cobrança de produção sai hoje como "Descrição não informada", e
   * cobrança irreconhecível é das maiores causas de contestação.
   *
   * Vai em `subscription.description` no POST /v3/checkouts. Medido contra o
   * SANDBOX em 14/08/2026: `description` é o campo certo — uma assinatura
   * criada direto (POST /v3/subscriptions) com ele gera a cobrança já com
   * `description` preenchida. O que NÃO deu para confirmar sem pagar um
   * checkout de verdade é se o checkout hospedado repassa o campo: ele aceita
   * (200) mas não devolve no eco — igualzinho ao que faz com um campo
   * inventado — e não existe GET /v3/checkouts para ler o que ficou gravado.
   *
   * Curto de propósito: é texto de fatura, e fatura corta o que é longo.
   */
  chargeDescription: string;
}

/** Formata em BRL como a página de preços já exibia (R$ 59,50 / R$ 499). */
export function formatBrl(value: number): string {
  return Number.isInteger(value)
    ? `R$ ${value}`
    : `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export const PLANS: Record<PlanInterval, Plan> = {
  month: {
    interval: 'month',
    value: 59.5,
    cycle: 'MONTHLY',
    label: 'Mensal',
    priceLabel: formatBrl(59.5),
    itemName: 'Creatools Mensal',
    itemDescription: 'Assinatura mensal do Creatools: carrosséis com IA, 200 créditos por mês.',
    chargeDescription: 'Creatools — Plano Mensal',
  },
  year: {
    interval: 'year',
    value: 499,
    cycle: 'YEARLY',
    label: 'Anual',
    priceLabel: formatBrl(499),
    itemName: 'Creatools Anual',
    itemDescription: 'Assinatura anual do Creatools: carrosséis com IA, 300 créditos por mês.',
    chargeDescription: 'Creatools — Plano Anual',
  },
};

/** Narrowing de entrada não confiável (body de rota pública, query string). */
export function isPlanInterval(value: unknown): value is PlanInterval {
  return value === 'month' || value === 'year';
}

/**
 * Plano do intervalo. Sem fallback silencioso de propósito: quem chama com
 * intervalo inválido precisa devolver 4xx, não cobrar o plano mensal por
 * engano. Use isPlanInterval antes.
 */
export function planFor(interval: PlanInterval): Plan {
  return PLANS[interval];
}
