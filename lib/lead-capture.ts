/**
 * Lógica pura da captura de lead — sem React, sem fetch, sem DOM — para poder
 * testar validação e ordem de operações no vitest (node), como o resto do
 * projeto. O componente (LeadCaptureModal) só liga estado a estas funções.
 *
 * A regra central vive em `submitLeadThenCheckout`: o lead é SALVO antes do
 * checkout e é condição para prosseguir. O lead é o ativo que não pode se
 * perder: é ele que gera o id usado como `externalReference` do checkout, a
 * chave que liga o pagamento de volta ao comprador — além do remarketing. Por
 * isso nunca depende de o pagamento dar certo.
 */

export type LeadInterval = 'month' | 'year';

export type LeadForm = {
  name: string;
  email: string;
  phone: string;
};

export type LeadFormErrors = Partial<Record<keyof LeadForm, string>>;

// Mesma regra da rota /api/leads no servidor: um @, um ponto no domínio, sem
// espaços. Não tenta validar RFC completa — só barrar erro grosseiro no client.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Teto de tamanho por campo. Sem isso a rota pública aceita uma string de MB
 * por campo (DoS de memória / lixo no banco). 200 cobre com folga qualquer
 * nome/e-mail/telefone real. Barra ANTES do formato: um e-mail gigante casa o
 * regex (o local part é "não-@"), então o comprimento é uma checagem própria.
 */
export const MAX_LEAD_FIELD_LEN = 200;

export function isValidEmail(email: string): boolean {
  const v = email.trim();
  return v.length <= MAX_LEAD_FIELD_LEN && EMAIL_RE.test(v);
}

export function isValidName(name: string): boolean {
  const v = name.trim();
  return v.length >= 2 && v.length <= MAX_LEAD_FIELD_LEN;
}

/**
 * Telefone BR: conta só os dígitos e aceita 10 (fixo com DDD) ou 11 (celular
 * com DDD). Um prefixo 55 (país) é tolerado e descontado. Máscara, espaços,
 * parênteses e traços são ignorados — o usuário digita como quiser.
 */
export function isValidBrPhone(phone: string): boolean {
  if (phone.trim().length > MAX_LEAD_FIELD_LEN) return false;
  const digits = phone.replace(/\D/g, '');
  const national = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
  return national.length === 10 || national.length === 11;
}

export function validateLeadForm(form: LeadForm): LeadFormErrors {
  const errors: LeadFormErrors = {};
  if (!isValidName(form.name)) errors.name = 'Informe seu nome.';
  if (!isValidEmail(form.email)) errors.email = 'Informe um e-mail válido.';
  if (!isValidBrPhone(form.phone)) errors.phone = 'Informe um telefone válido com DDD.';
  return errors;
}

export function hasErrors(errors: LeadFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Erro de validação com o mapa de campos, para o componente pintar cada input. */
export class LeadValidationError extends Error {
  constructor(readonly errors: LeadFormErrors) {
    super('Dados do lead inválidos.');
    this.name = 'LeadValidationError';
  }
}

export type SavedLead = LeadForm & { interval: LeadInterval };

export type SubmitLeadDeps = {
  /**
   * Persiste o lead e devolve o ID da linha gravada. Deve resolver só quando a
   * gravação estiver confirmada — o ID é o que amarra o pagamento ao comprador.
   */
  saveLead: (lead: SavedLead) => Promise<string>;
  /** Segue para o checkout com o lead já gravado. */
  startCheckout: (interval: LeadInterval, leadId: string) => Promise<void>;
};

/**
 * Valida → SALVA o lead → só então segue para o checkout.
 *
 * Ordem é contratual, não incidental:
 *  - validação inválida lança ANTES de qualquer efeito colateral (nada é salvo,
 *    nenhum checkout é iniciado);
 *  - se `saveLead` rejeitar, `startCheckout` NÃO é chamado — não redireciona a
 *    pessoa para pagar sem ter registrado o interesse dela;
 *  - o ID devolvido por `saveLead` é o que segue para o checkout. Ele vira o
 *    externalReference do Asaas, ou seja, a chave pela qual o webhook liga o
 *    pagamento de volta a esta pessoa. Sem lead gravado não há como reconhecer
 *    quem pagou — por isso a ordem é obrigatória, não uma conveniência.
 */
export async function submitLeadThenCheckout(
  form: LeadForm,
  interval: LeadInterval,
  deps: SubmitLeadDeps,
): Promise<void> {
  const errors = validateLeadForm(form);
  if (hasErrors(errors)) throw new LeadValidationError(errors);

  const email = form.email.trim().toLowerCase();
  const name = form.name.trim();
  const phone = form.phone.trim();

  const leadId = await deps.saveLead({ name, email, phone, interval });
  if (!leadId) throw new Error('Não foi possível registrar seus dados.');

  await deps.startCheckout(interval, leadId);
}
