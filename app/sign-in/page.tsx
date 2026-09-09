// app/sign-in/page.tsx
// The chapter's own sign-in page.
//
// Replaces Clerk's hosted account portal. The flow underneath is still Clerk —
// `useSignIn` drives the same instance, the same factors, the same sessions —
// but every element on screen is ours, which is what lets the page carry the
// chapter's theme instead of a stranger's.
//
// `/member/onboard` has linked here since it was written; until now the route
// did not exist and that link 404'd.
import SignInWorkspace from "./SignInWorkspace";

export const dynamic = "force-dynamic";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { redirect_url?: string; redirect?: string; logout?: string };
}) {
  return (
    <SignInWorkspace
      redirectUrl={searchParams?.redirect_url ?? searchParams?.redirect ?? ""}
      logoutReason={searchParams?.logout}
    />
  );
}
