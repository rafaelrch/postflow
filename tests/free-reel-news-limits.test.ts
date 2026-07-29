import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../supabase/migrations/20260727_free_reel_news_limits.sql', import.meta.url),
  'utf8',
);

function fnBody(name: string): string {
  return sql.match(new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`, 'i'))?.[0] ?? '';
}

describe('migration 20260727: travas de Reels e News no free', () => {
  it('é ARQUIVO NOVO, transacional e não altera migrations aplicadas', () => {
    expect(sql).toMatch(/^begin;/im);
    expect(sql).toMatch(/commit;/i);
  });

  describe('REELS: 1 no total', () => {
    const fn = fnBody('enforce_free_reel_limit');
    it('trigger BEFORE INSERT em reels, SECURITY DEFINER, search_path fixo', () => {
      expect(sql).toMatch(/create trigger enforce_free_reel_limit_trg\s+before insert on public\.reels/i);
      expect(fn).toMatch(/security definer/i);
      expect(fn).toMatch(/set search_path = pg_catalog, public/i);
    });
    it('pro retorna cedo; falha fechada (null → free); conta o acervo total', () => {
      expect(fn).toMatch(/if v_plan = 'pro' then\s*return new;/i);
      expect(fn).toMatch(/if v_plan is null then\s*v_plan := 'free';/i);
      expect(fn).toMatch(/count\(\*\)[\s\S]*from public\.reels\s*where user_id = new\.user_id/i);
      expect(fn).not.toMatch(/interval/i); // acervo total, sem janela
    });
    it('recusa a partir do 2º com código próprio; nada é apagado', () => {
      expect(fn).toMatch(/v_count >= 1/i);
      expect(fn).toMatch(/raise exception 'free_reel_limit'/i);
      expect(fn).not.toMatch(/delete/i);
    });
  });

  describe('NEWS: 4 por janela deslizante de 24h', () => {
    const fn = fnBody('enforce_free_news_daily_limit');
    it('trigger BEFORE INSERT em news_entries, SECURITY DEFINER, search_path fixo', () => {
      expect(sql).toMatch(/create trigger enforce_free_news_daily_limit_trg\s+before insert on public\.news_entries/i);
      expect(fn).toMatch(/security definer/i);
      expect(fn).toMatch(/set search_path = pg_catalog, public/i);
    });
    it('pro retorna cedo; falha fechada (null → free)', () => {
      expect(fn).toMatch(/if v_plan = 'pro' then\s*return new;/i);
      expect(fn).toMatch(/if v_plan is null then\s*v_plan := 'free';/i);
    });
    it('conta JANELA DESLIZANTE de 24h (created_at > now() - interval), não dia de calendário', () => {
      expect(fn).toMatch(/created_at > now\(\) - interval '24 hours'/i);
      expect(fn).not.toMatch(/current_date|date_trunc/i);
    });
    it('recusa a partir da 5ª com código próprio e distinto; nada é apagado', () => {
      expect(fn).toMatch(/v_count >= 4/i);
      expect(fn).toMatch(/raise exception 'free_news_daily_limit'/i);
      expect(fn).not.toMatch(/delete/i);
    });
  });

  it('os dois códigos são distintos entre si e do carrossel', () => {
    expect(sql).toMatch(/free_reel_limit/);
    expect(sql).toMatch(/free_news_daily_limit/);
    expect(sql).not.toMatch(/free_project_limit/); // não reaproveita o do carrossel
  });
});
