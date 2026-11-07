"use client";

// "Report a problem" in the public footer, carrying the page it was clicked on
// so the report form can prefill "Page URL".
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ReportProblemLink({ className }: { className?: string }) {
  const pathname = usePathname() || "/";
  const href = pathname.startsWith("/report") ? "/report" : `/report?from=${encodeURIComponent(pathname)}`;
  return (
    <Link href={href} className={className}>
      Report a problem
    </Link>
  );
}
