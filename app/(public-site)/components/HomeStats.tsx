"use client";

import { useEffect, useRef, useState } from "react";
import { FaUsers, FaGraduationCap, FaBuilding } from "react-icons/fa";

type HomeStatsProps = {
  className?: string;
};

export default function HomeStats({ className }: HomeStatsProps) {
  const [stats, setStats] = useState({ actives: 0, alumni: 0, chapters: 0 });
  const statsStartedRef = useRef(false);
  const statsRafRef = useRef<number | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const targets = { actives: 60, alumni: 400, chapters: 90 };
    const durationMs = 2000;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || statsStartedRef.current) return;
          statsStartedRef.current = true;

          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / durationMs, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setStats({
              actives: Math.round(targets.actives * eased),
              alumni: Math.round(targets.alumni * eased),
              chapters: Math.round(targets.chapters * eased),
            });

            if (progress < 1) {
              statsRafRef.current = requestAnimationFrame(step);
            }
          };

          statsRafRef.current = requestAnimationFrame(step);
          observer.disconnect();
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      if (statsRafRef.current !== null) {
        cancelAnimationFrame(statsRafRef.current);
      }
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className={className || "mx-auto mt-16 w-full max-w-5xl rounded-[28px] bg-[#120a0a] px-8 py-12 reveal"}
    >
      <div className="grid grid-cols-1 gap-10 text-center sm:grid-cols-3">
        <div>
          <FaUsers className="mx-auto" color="#e2ab16" size={72} />
          <h3 className="mt-4 text-4xl font-black text-[#b3202a]">
            {stats.actives}+
          </h3>
          <p className="mt-2 text-sm uppercase tracking-[0.28em] text-white/75">
            Active Brothers
          </p>
        </div>
        <div>
          <FaGraduationCap className="mx-auto" color="#e2ab16" size={72} />
          <h3 className="mt-4 text-4xl font-black text-[#b3202a]">
            {stats.alumni}+
          </h3>
          <p className="mt-2 text-sm uppercase tracking-[0.28em] text-white/75">
            Alumni
          </p>
        </div>
        <div>
          <FaBuilding className="mx-auto" color="#e2ab16" size={72} />
          <h3 className="mt-4 text-4xl font-black text-[#b3202a]">
            {stats.chapters}+
          </h3>
          <p className="mt-2 text-sm uppercase tracking-[0.28em] text-white/75">
            Chapters Nationwide
          </p>
        </div>
      </div>
    </section>
  );
}
