"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import LoadingState from "../../components/LoadingState";

const TABS = [
  { href: "/member/admin/members", label: "Manage Members" },
  { href: "/member/admin/committees", label: "Manage Committees" },
  { href: "/member/admin/invite", label: "Invite Member" },
  { href: "/member/admin/pending", label: "Pending Requests" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [me, setMe] = useState<{ role: string; rollNo: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/members/me")
      .then((r) => r.json())
      .then((d) => {
        setMe({ role: d.role, rollNo: d.rollNo });
        setLoading(false);
      })
      .catch(() => {
        setMe(null);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <LoadingState message="Loading admin console..." />;
  }

  if (!me || (me.role !== "admin" && me.role !== "superadmin")) {
    return (
      <div className="container">
        <div className="alert alert-danger d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>Unauthorized</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="member-dashboard">
      <section className="bento-card admin-tabs">
        <div className="admin-tabs__header">
          <h2 className="admin-tabs__title">Admin Console</h2>
        </div>
        <div className="admin-tabs__nav">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`admin-tab${active ? " active" : ""}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </section>
      <div className="admin-content">{children}</div>
    </div>
  );
}
