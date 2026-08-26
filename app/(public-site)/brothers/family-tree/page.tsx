import Image from "next/image";
import { Bungee } from "next/font/google";
import { pageMetadata } from "@/lib/seo";
import FamilyTreeContent from "./FamilyTreeContent";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

export const metadata = pageMetadata({
  title: "Family Tree",
  description:
    "Explore the big and little lineages of the Theta Tau Delta Gamma chapter at ASU.",
  path: "/brothers/family-tree",
});

export default function FamilyTreePage() {
  return (
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative min-h-[70vh] w-full">
        <Image
          src="/PNM_LakeDay.jpg"
          fill
          priority
          alt="Theta Tau rush tabling"
          className="object-cover object-[40%_40%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/55 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[70vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Lineage
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Family Tree
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Trace bigs, littles, and connections across our brotherhood.
          </p>
        </div>
      </section>
      <FamilyTreeContent />
    </main>
  );
}