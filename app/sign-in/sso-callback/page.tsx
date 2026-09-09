// app/sign-in/sso-callback/page.tsx
// Where Google sends the member back.
//
// `AuthenticateWithRedirectCallback` is headless — it finishes the handshake
// and navigates on, rendering nothing — so the spinner below is ours and the
// member never sees a blank page while the exchange completes.
"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

import LoadingState from "../../(members-only)/components/LoadingState";

export default function SsoCallbackPage() {
  return (
    <>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/member"
        signUpFallbackRedirectUrl="/member/onboard"
      />
      <LoadingState message="Finishing sign-in..." />
    </>
  );
}
