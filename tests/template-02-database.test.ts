import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260805230441_allow_template02_style.sql');
const schema = read('supabase/schema.sql');
const setupSchema = read('lib/database-schema.ts');
const allowedStyles = "('minimalist', 'profile', 'editorial', 'template01', 'template02')";

describe('Template 2 — contrato do banco', () => {
  it('migra as constraints de carrosséis e templates para aceitar template02', () => {
    expect(migration).toContain('drop constraint if exists carousels_style_check');
    expect(migration).toContain('drop constraint if exists templates_style_check');
    expect(migration.match(new RegExp(allowedStyles.replace(/[()]/g, '\\$&'), 'g'))).toHaveLength(2);
  });

  it('mantém os dois schemas de instalação alinhados com a migração', () => {
    for (const source of [schema, setupSchema]) {
      expect(source).toContain(`carousels_style_check check (style in ${allowedStyles})`);
      expect(source).toContain(`templates_style_check check (style in ${allowedStyles})`);
    }
  });
});
