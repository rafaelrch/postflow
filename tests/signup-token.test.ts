import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSignupToken, verifySignupToken } from '../lib/signup-token';

const LEAD_ID = '3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const OUTRO_LEAD = '11112222-3333-4444-5555-666677778888';
const SEGREDO = 'segredo-de-teste-com-mais-de-16-chars';

let original: string | undefined;

beforeEach(() => {
  original = process.env.SIGNUP_TOKEN_SECRET;
  process.env.SIGNUP_TOKEN_SECRET = SEGREDO;
});

afterEach(() => {
  if (original === undefined) delete process.env.SIGNUP_TOKEN_SECRET;
  else process.env.SIGNUP_TOKEN_SECRET = original;
});

describe('token da successUrl — ida e volta', () => {
  it('token emitido por nós volta com o mesmo leadId', () => {
    expect(verifySignupToken(createSignupToken(LEAD_ID))).toBe(LEAD_ID);
  });

  it('tolera espaço em volta (a URL pode chegar com %20 decodificado)', () => {
    expect(verifySignupToken(`  ${createSignupToken(LEAD_ID)}  `)).toBe(LEAD_ID);
  });
});

describe('token da successUrl — rejeições', () => {
  it('assinatura adulterada não passa', () => {
    const token = createSignupToken(LEAD_ID);
    const [id, sig] = token.split('.');
    // Vira o primeiro caractere da assinatura, mantendo o comprimento.
    const alterado = `${id}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`;

    expect(verifySignupToken(alterado)).toBeNull();
  });

  it('trocar o leadId mantendo a assinatura não passa (é o ataque óbvio)', () => {
    const [, sig] = createSignupToken(LEAD_ID).split('.');

    expect(verifySignupToken(`${OUTRO_LEAD}.${sig}`)).toBeNull();
  });

  it('token gerado com OUTRO segredo não passa', () => {
    const token = createSignupToken(LEAD_ID);
    process.env.SIGNUP_TOKEN_SECRET = 'outro-segredo-completamente-diferente';

    expect(verifySignupToken(token)).toBeNull();
  });

  it('lixo, vazio e ausente não passam', () => {
    expect(verifySignupToken(undefined)).toBeNull();
    expect(verifySignupToken(null)).toBeNull();
    expect(verifySignupToken('')).toBeNull();
    expect(verifySignupToken('nao-e-token')).toBeNull();
    expect(verifySignupToken(`${LEAD_ID}.`)).toBeNull();
    expect(verifySignupToken(`${LEAD_ID}.curto`)).toBeNull();
  });
});

describe('token da successUrl — configuração', () => {
  it('sem SIGNUP_TOKEN_SECRET, LANÇA em vez de cair num segredo default', () => {
    delete process.env.SIGNUP_TOKEN_SECRET;

    // Um default silencioso tornaria o token forjável por qualquer um que leia
    // o repositório — exatamente o que ele existe para impedir.
    expect(() => createSignupToken(LEAD_ID)).toThrow(/SIGNUP_TOKEN_SECRET/);
  });

  it('segredo curto demais também LANÇA', () => {
    process.env.SIGNUP_TOKEN_SECRET = 'curto';

    expect(() => createSignupToken(LEAD_ID)).toThrow(/SIGNUP_TOKEN_SECRET/);
  });
});
