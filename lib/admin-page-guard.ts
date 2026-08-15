import { forbidden, unauthorized } from 'next/navigation';
import { requireAdmin, type AdminAccess } from './admin-auth';

/**
 * Guarda das PÁGINAS /admin. Traduz a decisão de requireAdmin() nos
 * interrupts do Next, que respondem com HTTP 401/403 de verdade e rendem a
 * UI de `unauthorized.tsx` / `forbidden.tsx`.
 *
 * Por que não redirecionar para /login: o status importa. Um 302 para o login
 * diz "esta rota existe e você só precisa entrar" — para quem está de fora, um
 * mapa. E, no caso do 403, redirecionar esconderia do próprio Rafael que o
 * problema é a allowlist, não a senha.
 *
 * Módulo separado de lib/admin-auth.ts porque `next/navigation` só existe
 * dentro do render do Next: os route handlers usam adminDenialResponse() e não
 * podem arrastar este import junto.
 */
export async function requireAdminPage(): Promise<Extract<AdminAccess, { ok: true }>> {
  const access = await requireAdmin();
  if (access.ok) return access;
  if (access.status === 401) unauthorized();
  forbidden();
}
