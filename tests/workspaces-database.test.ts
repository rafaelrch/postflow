import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/20260826_task_1_workspaces_context.sql', import.meta.url), 'utf8');
const hardeningMigration = readFileSync(new URL('../supabase/migrations/20260826180918_task_1_workspaces_security_hardening.sql', import.meta.url), 'utf8');
const searchPathMigration = readFileSync(new URL('../supabase/migrations/20260826181200_task_1_workspace_function_search_path.sql', import.meta.url), 'utf8');
const validationRepairMigration = readFileSync(new URL('../supabase/migrations/20260826182000_task_1_validate_workspace_references.sql', import.meta.url), 'utf8');
const referralMigration = readFileSync(new URL('../supabase/migrations/20260826195759_task_1_onboarding_referral.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const setupSchema = readFileSync(new URL('../lib/database-schema.ts', import.meta.url), 'utf8');

describe('Task 1 database contract', () => {
  it('persiste referral opcional com o mesmo contrato nos instaladores', () => {
    for (const source of [referralMigration, schema, setupSchema]) {
      expect(source).toContain('referral_source text');
      expect(source).toContain('profiles_referral_source_check');
      for (const value of ['twitter_x', 'youtube', 'google_search', 'instagram', 'tiktok', 'facebook', 'reddit', 'hacker_news']) {
        expect(source).toContain(`'${value}'`);
      }
    }
    expect(referralMigration).toContain('alter table public.profiles');
    expect(referralMigration).toContain('add column if not exists referral_source text');
    expect(referralMigration).toContain('referral_source is null');
  });

  it('declares every workspace boundary and the same contract in both installers', () => {
    for (const source of [migration, schema, setupSchema]) {
      expect(source).toContain('create table if not exists public.workspaces');
      expect(source).toContain('create table if not exists public.workspace_members');
      expect(source).toContain('create table if not exists public.workspace_brand_context');
      expect(source).toContain('create table if not exists public.user_workspace_preferences');
      expect(source).toContain('active_workspace_id');
      expect(source).toContain('public.is_workspace_member');
      expect(source).toContain('workspace_id uuid');
      expect(source).toContain('create or replace function public.create_workspace_with_context');
    }
  });

  it('keeps account billing out of the workspace model and does not persist Collections', () => {
    expect(migration).not.toMatch(/create table[^\n]+collections/i);
    expect(migration).not.toMatch(/create table[^\n]+subscriptions/i);
    expect(migration).not.toMatch(/create table[^\n]+credits/i);
    expect(migration).toContain("role in ('owner', 'admin', 'editor', 'viewer')");
  });

  it('contains idempotent backfill and rejects forged context changes', () => {
    expect(migration).toContain('on conflict (user_id) do nothing');
    expect(migration).toContain("raise exception 'workspace_required'");
    expect(migration).toContain("raise exception 'workspace_forbidden'");
    expect(migration).toContain('workspace_id cannot be changed');
  });

  it('permite escrita compartilhada por editor/admin sem permitir trocar o autor', () => {
    for (const source of [migration, schema, setupSchema]) {
      const roleBlock = source.slice(source.lastIndexOf('-- Final role reconciliation'));
      expect(roleBlock).toContain("table_name || '_workspace_update'");
      expect(roleBlock).toContain("table_name || '_workspace_insert'");
      expect(roleBlock).toContain("auth.uid() = user_id");
      expect(roleBlock).toContain('new.user_id is distinct from old.user_id');
      expect(roleBlock).toContain('for update using');
    }
  });

  it('mantém o bloco final de políticas equivalente nos três instaladores', () => {
    const finalBlock = (source: string) => {
      const start = source.lastIndexOf('-- Final role reconciliation');
      const hardeningStart = source.indexOf('-- TASK 1 — Security hardening', start);
      return source.slice(start, hardeningStart >= 0 ? hardeningStart : undefined).replace(/\s*`?\.trim\(\);\s*$/, '').trim();
    };
    expect(finalBlock(migration)).toBe(finalBlock(schema));
    expect(finalBlock(schema)).toBe(finalBlock(setupSchema));
  });

  it('mantém o backfill do projeto principal e de seus conteúdos no workspace inicial', () => {
    expect(migration).toContain('update public.projects p set workspace_id = w.id');
    expect(migration).toContain('update public.carousels c set workspace_id = coalesce(');
    expect(migration).toContain('select p.workspace_id from public.projects p where p.id = s.project_id');
    expect(migration).toContain('select c.workspace_id from public.carousels c where c.id = s.carousel_id');
    expect(migration).toContain('select n.workspace_id from public.news_entries n where n.id = s.news_entry_id');
    expect(migration).toContain('on conflict (user_id) do nothing');
  });

  it('usa subconsultas correlacionadas em todos os backfills de conteúdo', () => {
    const targets = [
      { update: 'update public.carousels c set workspace_id', alias: 'c', projectId: 'c.project_id' },
      { update: 'update public.news_entries n set workspace_id', alias: 'n', projectId: 'n.project_id' },
      { update: 'update public.templates t set workspace_id', alias: 't', projectId: 't.project_id' },
      { update: 'update public.assets a set workspace_id', alias: 'a', projectId: 'a.project_id' },
      { update: 'update public.scheduled_posts s set workspace_id', alias: 's', projectId: 's.project_id' },
    ];

    for (const source of [migration, schema, setupSchema]) {
      for (const [index, target] of targets.entries()) {
        const start = source.indexOf(target.update);
        const nextUpdate = targets[index + 1]?.update ?? 'update public.content_relations';
        const end = source.indexOf(nextUpdate, start);
        const backfill = source.slice(start, end);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        expect(backfill).toContain(`(select p.workspace_id from public.projects p where p.id = ${target.projectId}`);
        expect(backfill).toContain('coalesce(');
        expect(backfill).toContain('from public.workspaces w');
        expect(backfill).toContain('w.id');
        expect(backfill).not.toMatch(new RegExp(`left\\s+join[\\s\\S]*?on[\\s\\S]*?\\b${target.alias}\\.`, 'i'));
      }
    }
  });

  it('restringe toda SECURITY DEFINER da Task 1 e exige revoke explícito', () => {
    const withoutComments = migration
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '');
    const securityDefinerFunctions = [...withoutComments.matchAll(/create or replace function public\.([a-z0-9_]+)[\s\S]*?(?=create or replace function public\.|$)/gi)]
      .filter((match) => /security\s+definer/i.test(match[0]))
      .map((match) => match[1]);

    expect(new Set(securityDefinerFunctions)).toEqual(new Set([
      'is_workspace_member',
      'active_workspace_id',
      'assign_active_workspace',
      'validate_workspace_references',
      'create_workspace_with_context',
      'update_workspace',
    ]));

    for (const functionName of new Set(securityDefinerFunctions)) {
      expect(hardeningMigration).toMatch(new RegExp(
        `revoke\\s+execute\\s+on\\s+function\\s+public\\.${functionName}\\([^;]*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
        'i',
      ));
    }

    for (const functionName of ['is_workspace_member', 'active_workspace_id', 'create_workspace_with_context', 'update_workspace']) {
      expect(hardeningMigration).toMatch(new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${functionName}\\([^;]*\\)\\s+to\\s+authenticated`,
        'i',
      ));
    }

    for (const functionName of ['assign_active_workspace', 'validate_workspace_references']) {
      expect(hardeningMigration).not.toMatch(new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${functionName}\\([^;]*\\)\\s+to\\s+authenticated`,
        'i',
      ));
    }

    const normalizeSql = (source: string) => source.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
    const mirrorStatements = hardeningMigration
      .replace(/--[^\n]*/g, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of mirrorStatements) {
      expect(normalizeSql(schema)).toContain(normalizeSql(statement));
      expect(normalizeSql(setupSchema)).toContain(normalizeSql(statement));
    }
  });

  it('fixa search_path dos helpers de workspace nos três instaladores', () => {
    const expectedStatements = [
      'alter function public.workspace_slug(text) set search_path = public, pg_temp;',
      'alter function public.set_workspace_updated_at() set search_path = public, pg_temp;',
    ];
    for (const statement of expectedStatements) {
      expect(searchPathMigration).toContain(statement);
      expect(schema).toContain(statement);
      expect(setupSchema).toContain(statement);
    }
  });

  it('valida referências sem acessar diretamente campos opcionais de NEW', () => {
    const optionalFields = [
      'project_id',
      'carousel_id',
      'news_entry_id',
      'related_carousel_id',
      'source_type',
      'source_id',
      'target_type',
      'target_id',
    ];
    const functionBlock = (source: string) => {
      const start = source.lastIndexOf('create or replace function public.validate_workspace_references()');
      const end = source.indexOf('$$;', start) + 3;
      return source.slice(start, end);
    };
    const expectedFragments = [
      'row_data := to_jsonb(new);',
      "project_id := (nullif(row_data->>'project_id', ''))::uuid;",
      "carousel_id := (nullif(row_data->>'carousel_id', ''))::uuid;",
      "news_entry_id := (nullif(row_data->>'news_entry_id', ''))::uuid;",
      "related_carousel_id := (nullif(row_data->>'related_carousel_id', ''))::uuid;",
      "source_type := nullif(row_data->>'source_type', '');",
      "source_id := (nullif(row_data->>'source_id', ''))::uuid;",
      "target_type := nullif(row_data->>'target_type', '');",
      "target_id := (nullif(row_data->>'target_id', ''))::uuid;",
      "raise exception 'project_workspace_mismatch'",
      "raise exception 'carousel_workspace_mismatch'",
      "raise exception 'news_workspace_mismatch'",
      "raise exception 'related_carousel_workspace_mismatch'",
      "raise exception 'source_workspace_mismatch'",
      "raise exception 'target_workspace_mismatch'",
    ];

    for (const source of [validationRepairMigration, schema, setupSchema]) {
      const block = functionBlock(source);
      expect(block).toContain('set search_path = public, pg_temp');
      for (const fragment of expectedFragments) expect(block).toContain(fragment);
      for (const field of optionalFields) expect(block).not.toMatch(new RegExp(`\\bnew\\.${field}\\b`));
    }
  });
});
