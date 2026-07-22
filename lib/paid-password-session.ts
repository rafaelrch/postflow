type PaidPasswordlessUser = {
  email_confirmed_at?: string | null;
  app_metadata?: { origin?: unknown } | null;
};

type PaidPasswordlessSession = {
  user?: PaidPasswordlessUser | null;
} | null | undefined;

/** The marker is written by service-role admin.createUser and is not client-editable. */
export function isPaidPasswordlessSession(session: PaidPasswordlessSession): boolean {
  const user = session?.user;
  return Boolean(user?.email_confirmed_at && user.app_metadata?.origin === 'paid_passwordless');
}
