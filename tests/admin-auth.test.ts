import { describe, expect, it } from 'vitest';
import { decideAdminAccess, parseAdminEmails } from '../lib/admin-auth';

/**
 * A porta do /admin. Cada caso aqui é uma forma conhecida de deixar o painel
 * do negócio aberto por acidente.
 */

const RAFAEL = 'rafaelrocha250304@gmail.com';

function user(overrides: Partial<{ id: string; email: string | null; email_confirmed_at: string | null }> = {}) {
  return {
    id: 'user-1',
    email: RAFAEL,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('parseAdminEmails', () => {
  it('normaliza caixa, espaços e entradas vazias', () => {
    expect(parseAdminEmails('  Rafael@Exemplo.com , outro@x.com ,, ')).toEqual([
      'rafael@exemplo.com',
      'outro@x.com',
    ]);
  });

  it('devolve lista vazia quando a variável não existe', () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails('')).toEqual([]);
    expect(parseAdminEmails('   ,  , ')).toEqual([]);
  });
});

describe('decideAdminAccess', () => {
  it('visitante sem sessão recebe 401', () => {
    expect(decideAdminAccess(null, RAFAEL)).toEqual({
      ok: false,
      status: 401,
      reason: 'no_session',
    });
  });

  it('usuário logado fora da allowlist recebe 403', () => {
    expect(decideAdminAccess(user({ email: 'intruso@exemplo.com' }), RAFAEL)).toEqual({
      ok: false,
      status: 403,
      reason: 'not_allowlisted',
    });
  });

  it('e-mail da allowlist com caixa e espaços diferentes passa', () => {
    const access = decideAdminAccess(
      user({ email: '  RafaelRocha250304@Gmail.COM ' }),
      `  ${RAFAEL.toUpperCase()} , outro@x.com`,
    );
    expect(access).toEqual({ ok: true, userId: 'user-1', email: RAFAEL });
  });

  it('ADMIN_EMAILS vazia nega todo mundo — inclusive o dono', () => {
    expect(decideAdminAccess(user(), '')).toEqual({
      ok: false,
      status: 403,
      reason: 'allowlist_unset',
    });
    expect(decideAdminAccess(user(), undefined)).toEqual({
      ok: false,
      status: 403,
      reason: 'allowlist_unset',
    });
    // Só espaço e vírgula também é "vazia": nunca vira allowlist com um item ''.
    expect(decideAdminAccess(user(), ' , ')).toEqual({
      ok: false,
      status: 403,
      reason: 'allowlist_unset',
    });
  });

  it('e-mail na lista mas não confirmado recebe 403', () => {
    expect(decideAdminAccess(user({ email_confirmed_at: null }), RAFAEL)).toEqual({
      ok: false,
      status: 403,
      reason: 'email_unconfirmed',
    });
  });

  it('sessão sem e-mail nenhum não passa por lista vazia de string', () => {
    expect(decideAdminAccess(user({ email: null }), RAFAEL)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('não aceita e-mail que só CONTÉM o do admin', () => {
    expect(
      decideAdminAccess(user({ email: `${RAFAEL}.attacker.com` }), RAFAEL),
    ).toMatchObject({ ok: false, status: 403, reason: 'not_allowlisted' });
  });
});
