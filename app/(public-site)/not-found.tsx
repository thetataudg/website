import Link from "next/link";
import { Bungee } from "next/font/google";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#120a0a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-20%] h-[420px] w-[420px] rounded-full bg-[#b3202a]/30 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[380px] w-[380px] rounded-full bg-[#e2ab16]/25 blur-[120px]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-20 text-center sm:px-12">
        <p className="text-xs uppercase tracking-[0.5em] text-[#f5d79a]">
          Lost In The Chapter
        </p>
        <h1
          className={`${bungee.className} mt-4 text-5xl text-[#b3202a] sm:text-7xl`}
        >
          404
        </h1>
        <p className="mt-3 text-2xl text-white/90 sm:text-3xl">
          This page dipped out early.
        </p>
        <p className="mt-4 max-w-xl text-base text-white/70 sm:text-lg">
          The link you followed doesn’t exist here. Try one of the main routes
          below or head back home.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/" className="tt-button-primary">
            Go Home
          </Link>
          <Link href="/brothers" className="tt-button-secondary">
            Meet The Brothers
          </Link>
          <Link href="/rush" className="tt-button-secondary">
            Rush Info
          </Link>
        </div>

      </section>
    </main>
  );
}
