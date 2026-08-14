import SettingsTabs from '@/components/settings/SettingsTabs';

/**
 * Moldura das Configurações: título e abas, iguais nas duas seções.
 *
 * O layout não lê nada do banco de propósito — cada aba busca só o que ela
 * mostra. Buscar assinatura aqui faria a aba "Conta" pagar por uma consulta
 * que ela não usa.
 */
export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-8 max-w-2xl mx-auto w-full overflow-y-auto">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Configurações</h1>
      <SettingsTabs />
      {children}
    </div>
  );
}
