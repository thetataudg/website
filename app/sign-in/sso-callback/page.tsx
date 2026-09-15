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
      {/* Both /member: it forwards anyone without a profile to onboarding, so
        * one destination serves a first-time member and a returning one, and
        * there is no second rule here to fall out of step with the providers. */}
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/member"
        signUpFallbackRedirectUrl="/member"
      />
      <LoadingState message="Finishing sign-in..." />
    </>
  );
}
