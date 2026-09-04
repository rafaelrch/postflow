import { NotFound, Illustration } from '@/components/ui/NotFound';

export default function NotFoundPage() {
  return (
    <div className="relative flex flex-col w-full justify-center min-h-svh bg-white dark:bg-[#09090B] p-6 md:p-10">
      <div className="relative max-w-5xl mx-auto w-full">
        <Illustration className="absolute inset-0 w-full h-[50vh] opacity-[0.04] dark:opacity-[0.03] text-[#09090B] dark:text-[#FAFAFA]" />
        <NotFound />
      </div>
    </div>
  );
}
