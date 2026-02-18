"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);
const EXEMPT_PATHS = ["/member/lockdown", "/member/admin"];

export default function LockdownGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let canceled = false;
    const guard = async () => {
      try {
        const lockRes = await fetch("/api/lockdown");
        if (!lockRes.ok) return;
        const lock = await lockRes.json();
        if (!lock.active) return;
        if (EXEMPT_PATHS.some((path) => pathname.startsWith(path))) return;
        const meRes = await fetch("/api/members/me");
        if (!meRes.ok) {
          router.replace("/member/lockdown");
          return;
        }
        const me = await meRes.json();
        const role = (me.role || "").toLowerCase();
        if (ADMIN_ROLES.has(role)) return;
        if (canceled) return;
        router.replace("/member/lockdown");
      } catch (err) {
        console.error("Lockdown guard failed", err);
        if (!canceled && !pathname.startsWith("/member/lockdown")) {
          router.replace("/member/lockdown");
        }
      }
    };
    guard();
    return () => {
      canceled = true;
    };
  }, [pathname, router]);

  return null;
}
