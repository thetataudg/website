"use client";

// Who is looking at an admin page, for the sections only some officers can use.
// E-Council can open the admin console, but invitations are admin only and the
// card-payment queue is Treasurer or admin only (`requireTerminalOperator`).
// Pages ask this before calling those APIs, so E-Council never sees a 403.
import { useEffect, useState } from "react";

import { holdsOffice } from "@/lib/officeMatch";

export function useAdminViewer() {
  const [state, setState] = useState({
    ready: false,
    isAdmin: false,
    canSeeCardPayments: false,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/members/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        const isAdmin = data?.role === "admin" || data?.role === "superadmin";
        setState({
          ready: true,
          isAdmin,
          canSeeCardPayments: isAdmin || holdsOffice(data?.ecouncilPosition, "treasurer"),
        });
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, ready: true }));
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
