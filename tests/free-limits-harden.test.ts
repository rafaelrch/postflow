import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// NOTA DE HONESTIDADE: este repositório não roda um Postgres real nos testes
// (os testes de banco são asserções ESTÁTICAS sobre o SQL, como em
// free-plan-migration / free-reel-news-limits). Portanto NÃO há como exercitar
// um INSERT concorrente de verdade (achado 2) nem um INSERT com created_at
// forjado (achado 1) em unit test. Cobrimos os dois por presença/ordem no SQL
// da migration — não fingimos cobertura de concorrência que não existe.
// O mesmo vale para o trigger BEFORE UPDATE da fatia 7: asseguramos que ele
// existe e que descarta o created_at do cliente, não que o Postgres o dispare.

const sql = readFileSync(
  new URL('../supabase/migrations/20260728_harden_free_limits.sql', import.meta.url),
  'utf8',
);

function fnBody(name: string): string {
  return sql.match(new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`, 'i'))?.[0] ?? '';
}

const carousel = fnBody('enforce_free_carousel_limit');
const reel = fnBody('enforce_free_reel_limit');
const news = fnBody('enforce_free_news_daily_limit');
const freeze = fnBody('freeze_news_entries_created_at');

describe('migration 20260728: hardening dos limites free', () => {
  it('é ARQUIVO NOVO, transacional', () => {
    expect(sql).toMatch(/^begin;/im);
    expect(sql).toMatch(/commit;/i);
  });

  describe('ACHADO 1 — janela de news não é mais burlável por created_at', () => {
    it('o trigger de news FORÇA created_at server-side ANTES de contar', () => {
      expect(news).toMatch(/new\.created_at\s*:=\s*now\(\)\s*;/i);
      // A força vem ANTES do count e da janela — senão a contagem usaria o valor do cliente.
      const iForce = news.search(/new\.created_at\s*:=\s*now\(\)/i);
      const iCount = news.search(/count\(\*\)/i);
      const iWindow = news.search(/interval '24 hours'/i);
      expect(iForce).toBeGreaterThan(-1);
      expect(iForce).toBeLessThan(iCount);
      expect(iForce).toBeLessThan(iWindow);
    });

    it('existe trigger BEFORE UPDATE em news_entries fechando o ramo UPDATE/upsert', () => {
      expect(sql).toMatch(
        /create trigger freeze_news_entries_created_at_trg\s*\n?\s*before update on public\.news_entries\s*\n?\s*for each row execute function public\.freeze_news_entries_created_at\(\)/i,
      );
      // drop antes do create, como os outros triggers do arquivo (idempotência).
      const iDrop = sql.search(/drop trigger if exists freeze_news_entries_created_at_trg/i);
      const iCreate = sql.search(/create trigger freeze_news_entries_created_at_trg/i);
      expect(iDrop).toBeGreaterThan(-1);
      expect(iDrop).toBeLessThan(iCreate);
    });

    it('o trigger de UPDATE DESCARTA o created_at do cliente (mantém old.created_at)', () => {
      expect(freeze).toMatch(/new\.created_at\s*:=\s*old\.created_at\s*;/i);
      // não pode "consertar" pra now(): isso reiniciaria a janela a cada edição.
      expect(freeze).not.toMatch(/new\.created_at\s*:=\s*now\(\)/i);
      expect(freeze).toMatch(/security definer/i);
      expect(freeze).toMatch(/set search_path = pg_catalog, public/i);
      // só toca created_at — não colide com set_news_entries_updated (updated_at).
      expect(freeze).not.toMatch(/updated_at/i);
    });

    it('carrossel e reel NÃO precisam forçar created_at (contam acervo total, não janela)', () => {
      expect(carousel).not.toMatch(/interval/i);
      expect(reel).not.toMatch(/interval/i);
      expect(carousel).not.toMatch(/new\.created_at/i);
      expect(reel).not.toMatch(/new\.created_at/i);
    });
  });

  describe('ACHADO 2 — TOCTOU fechado com advisory lock por (tabela, usuário)', () => {
    it('cada trigger adquire UM advisory lock xact-scoped no caminho free', () => {
      expect(carousel).toMatch(/pg_advisory_xact_lock\(1,\s*hashtext\(new\.user_id::text\)\)/i);
      expect(reel).toMatch(/pg_advisory_xact_lock\(2,\s*hashtext\(new\.user_id::text\)\)/i);
      expect(news).toMatch(/pg_advisory_xact_lock\(3,\s*hashtext\(new\.user_id::text\)\)/i);
    });
    it('o lock vem no caminho free (depois do return pro) e antes do count', () => {
      for (const fn of [carousel, reel, news]) {
        const iPro = fn.search(/if v_plan = 'pro' then\s*return new;/i);
        const iLock = fn.search(/pg_advisory_xact_lock/i);
        const iCount = fn.search(/count\(\*\)/i);
        expect(iPro).toBeLessThan(iLock); // pro não paga o lock
        expect(iLock).toBeLessThan(iCount); // serializa antes de contar
      }
    });
  });

  describe('comportamento preservado nas 3 funções', () => {
    it('falha fechada (null → free) e PRO retorna cedo', () => {
      for (const fn of [carousel, reel, news]) {
        expect(fn).toMatch(/if v_plan is null then\s*v_plan := 'free';/i);
        expect(fn).toMatch(/if v_plan = 'pro' then\s*return new;/i);
      }
    });
    it('thresholds e códigos inalterados; nada é apagado', () => {
      expect(carousel).toMatch(/v_count >= 5/); expect(carousel).toMatch(/free_project_limit/);
      expect(reel).toMatch(/v_count >= 1/); expect(reel).toMatch(/free_reel_limit/);
      expect(news).toMatch(/v_count >= 4/); expect(news).toMatch(/free_news_daily_limit/);
      for (const fn of [carousel, reel, news]) expect(fn).not.toMatch(/delete/i);
    });
    it('SECURITY DEFINER com search_path fixo', () => {
      for (const fn of [carousel, reel, news]) {
        expect(fn).toMatch(/security definer/i);
        expect(fn).toMatch(/set search_path = pg_catalog, public/i);
      }
    });
  });

  describe('EXECUTE revogado das roles de cliente', () => {
    it('re-emite o revoke das 3 funções de limite e da função nova', () => {
      for (const fn of [
        'enforce_free_carousel_limit',
        'enforce_free_reel_limit',
        'enforce_free_news_daily_limit',
        'freeze_news_entries_created_at',
      ]) {
        expect(sql).toMatch(
          new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated;`, 'i'),
        );
      }
    });
  });
});
