// app/(members-only)/member/admin/layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/member/admin/members", label: "Manage Members" },
  { href: "/member/admin/invite", label: "Invite Member" },
  { href: "/member/admin/pending", label: "Pending Requests" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <>
      <ul className="nav nav-tabs mb-4 bg-light">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="nav-item">
              <Link
                href={tab.href}
                className={`nav-link${active ? " active" : ""}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="container">{children}</div>
    </>
  );
}
