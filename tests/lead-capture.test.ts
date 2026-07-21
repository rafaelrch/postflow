import { describe, expect, it, vi } from 'vitest';
import {
  isValidEmail,
  isValidName,
  isValidBrPhone,
  validateLeadForm,
  submitLeadThenCheckout,
  LeadValidationError,
  type LeadForm,
} from '../lib/lead-capture';

const VALIDO: LeadForm = {
  name: 'Rafael Rocha',
  email: 'Rafael@Test.com',
  phone: '(11) 99999-9999',
};

describe('validação de campos', () => {
  it('e-mail: aceita formato válido, rejeita malformado', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('  a@b.com  ')).toBe(true);
    expect(isValidEmail('nao-e-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a @b.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('nome: exige algo além de espaço em branco', () => {
    expect(isValidName('Rafael')).toBe(true);
    expect(isValidName(' ')).toBe(false);
    expect(isValidName('')).toBe(false);
  });

  it('telefone BR: 10 ou 11 dígitos com DDD, tolera máscara e +55', () => {
    expect(isValidBrPhone('(11) 99999-9999')).toBe(true); // celular 11 díg
    expect(isValidBrPhone('1133334444')).toBe(true); // fixo 10 díg
    expect(isValidBrPhone('+55 11 99999-9999')).toBe(true); // com país
    expect(isValidBrPhone('99999-9999')).toBe(false); // sem DDD (9 díg)
    expect(isValidBrPhone('123')).toBe(false);
    expect(isValidBrPhone('')).toBe(false);
  });

  it('validateLeadForm devolve um erro por campo inválido', () => {
    expect(validateLeadForm(VALIDO)).toEqual({});
    const errs = validateLeadForm({ name: '', email: 'x', phone: '1' });
    expect(errs.name).toBeTruthy();
    expect(errs.email).toBeTruthy();
    expect(errs.phone).toBeTruthy();
  });

  it('cap de tamanho: campo acima de 200 chars é inválido', () => {
    const huge = 'a'.repeat(201);
    expect(isValidName(huge)).toBe(false);
    // e-mail gigante casa o regex mas estoura o teto → inválido
    expect(isValidEmail(`${'a'.repeat(200)}@test.com`)).toBe(false);
    // telefone com 10-11 dígitos mas enterrado em 200+ chars de lixo → inválido
    expect(isValidBrPhone(`${'x'.repeat(220)}11999999999`)).toBe(false);

    const errs = validateLeadForm({ name: huge, email: VALIDO.email, phone: VALIDO.phone });
    expect(errs.name).toBeTruthy();
  });
});

describe('submitLeadThenCheckout — ordem e contrato', () => {
  it('SALVA o lead ANTES de chamar o checkout', async () => {
    const calls: string[] = [];
    const saveLead = vi.fn(async () => {
      calls.push('save');
    });
    const startCheckout = vi.fn(async () => {
      calls.push('checkout');
    });

    await submitLeadThenCheckout(VALIDO, 'month', { saveLead, startCheckout });

    expect(saveLead).toHaveBeenCalledTimes(1);
    expect(startCheckout).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['save', 'checkout']); // ordem garantida
  });

  it('passa o MESMO e-mail normalizado ao lead e ao checkout (customer nasce com o e-mail certo)', async () => {
    const saveLead = vi.fn(async () => {});
    const startCheckout = vi.fn(async () => {});

    await submitLeadThenCheckout(VALIDO, 'year', { saveLead, startCheckout });

    // 'Rafael@Test.com' → normalizado
    expect(saveLead).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'rafael@test.com', interval: 'year', name: 'Rafael Rocha' }),
    );
    expect(startCheckout).toHaveBeenCalledWith('year', 'rafael@test.com');
  });

  it('e-mail inválido: lança LeadValidationError e NÃO salva nem inicia checkout', async () => {
    const saveLead = vi.fn(async () => {});
    const startCheckout = vi.fn(async () => {});

    await expect(
      submitLeadThenCheckout({ ...VALIDO, email: 'nao-e-email' }, 'month', {
        saveLead,
        startCheckout,
      }),
    ).rejects.toBeInstanceOf(LeadValidationError);

    expect(saveLead).not.toHaveBeenCalled();
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('se o save do lead falha, o checkout NÃO é chamado (não paga sem registrar interesse)', async () => {
    const saveLead = vi.fn(async () => {
      throw new Error('db down');
    });
    const startCheckout = vi.fn(async () => {});

    await expect(
      submitLeadThenCheckout(VALIDO, 'month', { saveLead, startCheckout }),
    ).rejects.toThrow('db down');

    expect(saveLead).toHaveBeenCalledTimes(1);
    expect(startCheckout).not.toHaveBeenCalled();
  });
});
