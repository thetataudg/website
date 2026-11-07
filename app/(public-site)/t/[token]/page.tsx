// /t/<token>: a task someone chose to share publicly. Read only, first names
// only, no comments or history. Turning the link off makes this a 404.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CalendarDays } from "lucide-react";

import { bungee } from "../../../fonts";
import { renderMarkdown } from "@/lib/markdownSafe";
import { getSharedTask } from "@/lib/tasks/service";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/tasks/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared task | Theta Tau Delta Gamma",
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<string, string> = {
  backlog: "bg-white/10 text-white/70",
  todo: "bg-white/15 text-white",
  in_progress: "bg-[#e2ab16] text-[#1b0f0f]",
  in_review: "bg-sky-400/90 text-[#0b1a26]",
  done: "bg-emerald-400/90 text-[#08210f]",
  canceled: "bg-white/10 text-white/60 line-through",
};

export default async function SharedTaskPage({ params }: { params: { token: string } }) {
  const task = await getSharedTask(params.token);
  if (!task) notFound();
  const done = task.checklist.filter((c) => c.done).length;

  return (
    <main className="min-h-screen bg-[#120a0a] px-4 pb-16 pt-28 text-white sm:px-8">
      <div className="mx-auto max-w-[720px] space-y-5">
        <header className="space-y-2">
          <p className="tt-eyebrow">
            {task.committeeName} · <span className="font-mono">{task.key}</span>
          </p>
          <h1 className={`${bungee.className} text-[26px] leading-tight text-[#f5d79a] sm:text-[32px]`}>{task.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className={`tt-pill ${STATUS_TONE[task.status] || STATUS_TONE.todo}`}>{STATUS_LABEL[task.status]}</span>
            {task.priority !== "none" ? (
              <span className="text-white/70">{PRIORITY_LABEL[task.priority]} priority</span>
            ) : null}
            {task.dueLabel ? (
              <span className={`inline-flex items-center gap-1 ${task.dueState === "overdue" ? "text-[#ff8a8a]" : "text-white/70"}`}>
                <CalendarDays className="size-3.5" aria-hidden="true" />
                Due {task.dueLabel}
              </span>
            ) : null}
            {task.assignees.length ? <span className="text-white/70">With {task.assignees.join(", ")}</span> : null}
          </div>
          {task.tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((t) => (
                <span key={t.name} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">
                  {t.name}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        {task.description ? (
          <section className="tt-card tt-on-cream">
            <div
              className="tt-md space-y-2 break-words text-[15px]"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(task.description) }}
            />
          </section>
        ) : null}

        {task.checklist.length ? (
          <section className="tt-card-dark space-y-2" aria-labelledby="checklist">
            <h2 id="checklist" className="text-[13px] font-semibold text-white/80">
              Checklist {done}/{task.checklist.length}
            </h2>
            <ul className="space-y-1.5">
              {task.checklist.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded ${
                      item.done ? "bg-[#e2ab16] text-[#1b0f0f]" : "border border-white/30"
                    }`}
                    aria-hidden="true"
                  >
                    {item.done ? <Check className="size-3" /> : null}
                  </span>
                  <span className={item.done ? "text-white/50 line-through" : "text-white/90"}>{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link href={`/member/tech/${encodeURIComponent(task.key)}`} className="tt-button-secondary">
          Open in the tracker
        </Link>
      </div>
    </main>
  );
}
