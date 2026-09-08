// app/sign-up/page.tsx
// The chapter's own account-creation page.
//
// Exists so `/sign-up` is a real route: it is Clerk's default `signUpUrl`, and
// the sign-in page links here. Account creation used to live only inside
// /member/onboard, which meant every other path to it 404'd.
import SignUpWorkspace from "@/components/auth/SignUpWorkspace";

export const dynamic = "force-dynamic";

export default function SignUpPage({
  searchParams,
}: {
  searchParams: { redirect_url?: string };
}) {
  return <SignUpWorkspace redirectUrl={searchParams?.redirect_url || undefined} />;
}
