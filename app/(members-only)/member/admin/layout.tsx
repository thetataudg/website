"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHourglass, faTimes } from "@fortawesome/free-solid-svg-icons";

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
    return (
      <div className="container">
        <div className="alert alert-info d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faHourglass} className="h2" />
          <h2>Loading...</h2>
        </div>
      </div>
    );
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