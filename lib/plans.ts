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
  },
  year: {
    interval: 'year',
    value: 499,
    cycle: 'YEARLY',
    label: 'Anual',
    priceLabel: formatBrl(499),
    itemName: 'Creatools Anual',
    itemDescription: 'Assinatura anual do Creatools: carrosséis com IA, 300 créditos por mês.',
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

/**
 * Imagem do item no checkout hospedado.
 *
 * A referência do Asaas lista items[].imageBase64 como OBRIGATÓRIO. Não
 * conseguimos confirmar no sandbox (sem chave na fase de escrita), e um plano
 * de SaaS não tem imagem natural — então mandamos sempre algo, para não
 * arriscar um 400 na criação do checkout.
 *
 * O valor real deve vir de ASAAS_ITEM_IMAGE_BASE64 (o logo do Creatools). O
 * fallback abaixo é um PNG 1x1 transparente: satisfaz o campo sem inventar uma
 * arte. Configure a env antes de ir para produção — um item sem imagem de
 * verdade fica pobre na página de pagamento.
 *
 * TODO(rafael): gerar o base64 do logo e setar ASAAS_ITEM_IMAGE_BASE64.
 */
const TRANSPARENT_PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function planItemImageBase64(): string {
  return process.env.ASAAS_ITEM_IMAGE_BASE64?.trim() || TRANSPARENT_PNG_1X1;
}
