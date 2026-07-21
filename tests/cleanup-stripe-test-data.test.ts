import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../supabase/cleanup-stripe-test-data.sql', import.meta.url), 'utf8');
const executableSql = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('cleanup-stripe-test-data.sql', () => {
  it('é fail-closed e nunca apaga subscriptions sem filtro estrito de provider', () => {
    const subscriptionDeletes = executableSql.match(/delete\s+from\s+public\.subscriptions\b[^;]*;/gi) ?? [];

    expect(subscriptionDeletes).toHaveLength(1);
    expect(subscriptionDeletes[0]).toMatch(
      /^delete\s+from\s+public\.subscriptions\s+where\s+provider\s*=\s*'stripe'\s*;$/i,
    );
    expect(executableSql).not.toMatch(/provider\s+is\s+null/i);
    expect(executableSql).not.toMatch(/delete\s+from\s+public\.subscriptions\s*;/i);

    const guard = executableSql.search(/if\s+not\s+exists\s*\(/i);
    const abort = executableSql.search(/raise\s+exception/i);
    const deletion = executableSql.search(/delete\s+from\s+public\.subscriptions/i);

    expect(guard).toBeGreaterThanOrEqual(0);
    expect(abort).toBeGreaterThan(guard);
    expect(deletion).toBeGreaterThan(abort);
  });
});
