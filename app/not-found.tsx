import { NotFound, Illustration } from '@/components/ui/NotFound';

export default function NotFoundPage() {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-white dark:bg-[#09090B] p-6 md:p-10">
      <div className="relative flex w-full max-w-5xl items-center justify-center">
        {/* Marca d'agua: centrada no bloco de texto, atras dele. Fica fora do
            fluxo, entao nao empurra nada e nao depende da altura da janela. */}
        <Illustration
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[min(50vh,320px)] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 select-none text-[#09090B] opacity-[0.04] dark:text-[#FAFAFA] dark:opacity-[0.03]"
        />
        <NotFound />
      </div>
    </div>
  );
}
