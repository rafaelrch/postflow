/**
 * Lógica pura da captura de lead — sem React, sem fetch, sem DOM — para poder
 * testar validação e ordem de operações no vitest (node), como o resto do
 * projeto. O componente (LeadCaptureModal) só liga estado a estas funções.
 *
 * A regra central vive em `submitLeadThenCheckout`: o lead é SALVO antes do
 * checkout e é condição para prosseguir. O lead é o ativo que não pode se
 * perder (remarketing + prova de quem iniciou a compra, já que a AbacatePay não
 * devolve e-mail no checkout), então nunca depende de o pagamento dar certo.
 */

export type LeadInterval = 'month' | 'year';

export type LeadForm = {
  name: string;
  email: string;
  phone: string;
};

export type LeadFormErrors = Partial<Record<keyof LeadForm, string>>;

// Mesma regra da rota /api/abacatepay/checkout: um @, um ponto no domínio, sem
// espaços. Não tenta validar RFC completa — só barrar erro grosseiro no client.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2;
}

/**
 * Telefone BR: conta só os dígitos e aceita 10 (fixo com DDD) ou 11 (celular
 * com DDD). Um prefixo 55 (país) é tolerado e descontado. Máscara, espaços,
 * parênteses e traços são ignorados — o usuário digita como quiser.
 */
export function isValidBrPhone(phone: string): boolean {
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
  /** Persiste o lead. Deve resolver só quando a gravação estiver confirmada. */
  saveLead: (lead: SavedLead) => Promise<void>;
  /** Segue para o checkout com o e-mail já coletado. */
  startCheckout: (interval: LeadInterval, email: string) => Promise<void>;
};

/**
 * Valida → SALVA o lead → só então segue para o checkout.
 *
 * Ordem é contratual, não incidental:
 *  - validação inválida lança ANTES de qualquer efeito colateral (nada é salvo,
 *    nenhum checkout é iniciado);
 *  - se `saveLead` rejeitar, `startCheckout` NÃO é chamado — não redireciona a
 *    pessoa para pagar sem ter registrado o interesse dela;
 *  - o e-mail é normalizado uma vez e o MESMO valor vai para o lead e para o
 *    checkout, garantindo que o customer da AbacatePay nasça com o e-mail certo.
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

  await deps.saveLead({ name, email, phone, interval });
  await deps.startCheckout(interval, email);
}
