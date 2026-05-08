"use client";

import { useEffect } from "react";
import { Bungee } from "next/font/google";
import FamilyTreeVisualization from "@/components/FamilyTreeVisualization";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

export default function FamilyTreeContent() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".reveal"));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  return (
    <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
      <div className="space-y-6">
        <div className="space-y-4">
          <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
            Chapter Lineage
          </h2>
          <p className="text-lg">
            Explore the Theta Tau family tree, from roots to the latest classes.
          </p>
          <p className="text-lg">
            Click any node to open a member profile.
          </p>
        </div>

        <FamilyTreeVisualization
          apiPath="/api/members/family-tree"
          profileBasePath="/brother"
          embedded
        />
      </div>
    </section>
  );
}