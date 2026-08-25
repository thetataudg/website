import * as React from "react";
import { ShieldAlert } from "lucide-react";

import { PageContainer } from "./shell/PageShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Shown when a member's access has been suspended or removed. Server-safe so
 * both server pages and client components can render it.
 */
export default function MembershipRevokedState({
  title = "Unauthorized",
  description = "Your membership has been suspended or removed, and you no longer have access to this application.",
}: {
  title?: string;
  description?: React.ReactNode;
} = {}) {
  return (
    <PageContainer>
      <Alert variant="destructive" role="alert">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    </PageContainer>
  );
}
