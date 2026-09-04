import { NotFound, Illustration } from '@/components/ui/NotFound';

export default function NotFoundPage() {
  return (
    <div className="relative flex flex-col w-full justify-center min-h-svh bg-[var(--background)] p-6 md:p-10">
      <div className="relative max-w-5xl mx-auto w-full">
        <Illustration className="absolute inset-0 w-full h-[50vh] text-[var(--foreground)] opacity-[0.04] dark:opacity-[0.03]" />
        <NotFound />
      </div>
    </div>
  );
}
