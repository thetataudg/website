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
    const controller = new AbortController();

    const guard = async () => {
      try {
        const lockRes = await fetch("/api/lockdown", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!lockRes.ok || canceled) return;

        const lock = await lockRes.json();
        if (!lock.active || canceled) return;
        if (EXEMPT_PATHS.some((path) => pathname.startsWith(path))) return;

        const meRes = await fetch("/api/members/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        // A session can be briefly unavailable immediately after sign-in.
        // Unknown identity is not proof that this member should be locked out.
        if (!meRes.ok || canceled) return;

        const me = await meRes.json();
        const role = (me.role || "").toLowerCase();
        if (ADMIN_ROLES.has(role) || me.isECouncil) return;
        if (canceled) return;

        router.replace("/member/lockdown");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Lockdown guard failed", err);
      }
    };

    void guard();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [pathname, router]);

  return null;
}
