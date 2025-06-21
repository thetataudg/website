// app/(members-only)/member/admin/invite/page.tsx
export const dynamic = "force-dynamic";

import ClientInvitePanel from "./ClientInvitePanel";

export default function InvitePage() {
  return <ClientInvitePanel />;
}
