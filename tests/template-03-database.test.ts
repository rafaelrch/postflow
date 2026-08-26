import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260825_template03_style.sql');
const schema = read('supabase/schema.sql');
const setupSchema = read('lib/database-schema.ts');
const allowedStyles = "('minimalist', 'profile', 'editorial', 'template01', 'template02', 'template03')";

describe('Template 3 — contrato do banco', () => {
  it('migra somente as constraints de estilo de carousels e templates', () => {
    expect(migration).toContain('drop constraint if exists carousels_style_check');
    expect(migration).toContain('drop constraint if exists templates_style_check');
    expect(migration.match(new RegExp(allowedStyles.replace(/[()]/g, '\\$&'), 'g'))).toHaveLength(2);
    expect(migration).not.toContain('template_model');
  });

  it('mantém supabase/schema.sql e lib/database-schema.ts alinhados', () => {
    for (const source of [schema, setupSchema]) {
      expect(source).toContain(`carousels_style_check check (style in ${allowedStyles})`);
      expect(source).toContain(`templates_style_check check (style in ${allowedStyles})`);
    }
  });
});
