import { Suspense } from "react";
import BrothersContent from "./BrothersContent";

function BrothersSkeleton() {
  return (
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative min-h-[55vh] w-full">
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[55vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-700" />
          <div className="mt-3 h-16 w-48 animate-pulse rounded bg-gray-700" />
          <div className="mt-4 h-6 w-80 animate-pulse rounded bg-gray-700" />
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10">
        <div className="h-8 w-40 animate-pulse rounded bg-gray-300" />
        <div className="mt-4 h-4 w-64 animate-pulse rounded bg-gray-300" />
      </section>
    </main>
  );
}

export default function BrothersPage() {
  return (
    <Suspense fallback={<BrothersSkeleton />}>
      <BrothersContent />
    </Suspense>
  );
}
