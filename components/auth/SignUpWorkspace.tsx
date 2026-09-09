"use client";

// The chapter's own account-creation form.
//
// Headless, like the sign-in page: `useSignUp` owns the protocol, we own every
// element. Two states, because Clerk's email flow has two:
//   details → name, username, email, password (or a provider)
//   verify  → the code Clerk emails, which must be attempted before a session
//             exists
//
// Accounts here are invitation-only in practice — an officer sends the invite
// and the member lands on /member/onboard afterwards to finish their profile —
// so this form deliberately does not advertise itself as an open sign-up.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { ArrowLeft, CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/app/(members-only)/components/LoadingState";
import { AUTH_MESSAGES, authErrorMessage } from "@/lib/clerkErrors";
import AuthCard from "./AuthCard";
import { AppleMark, GoogleMark } from "./BrandIcons";
import styles from "./auth.module.css";

type Step = "details" | "verify";
type Provider = "oauth_google" | "oauth_apple";

/// Where a finished sign-up lands: the invitation flow that collects roll
/// number, pledge class and the rest.
const AFTER_SIGN_UP = "/member/onboard";

export default function SignUpWorkspace({
  redirectUrl = AFTER_SIGN_UP,
}: {
  redirectUrl?: string;
}) {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [step, setStep] = useState<Step>("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Deliberately no autofocus, here or on any step: see SignInWorkspace.

  async function handleDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!isLoaded || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await signUp.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        emailAddress: email.trim(),
        password,
      });

      // Clerk will not hand back a session until the address is proven, so the
      // code step is not optional even when every field validated.
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });
      setCode("");
      setStep("verify");
      setNotice(`We sent a code to ${email.trim()}.`);
    } catch (err) {
      setError(authErrorMessage(err, "We couldn't create your account. Check the details and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!isLoaded || busy) return;

    setBusy(true);
    setError("");

    try {
      const attempt = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive?.({ session: attempt.createdSessionId });
        router.push(redirectUrl);
        return;
      }
      // Same trap as sign-in: a resolved request is not necessarily a session.
      setError(AUTH_MESSAGES.incomplete);
    } catch (err) {
      setError(authErrorMessage(err, AUTH_MESSAGES.codeIncorrect));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError("");
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setNotice("We sent a new code.");
    } catch (err) {
      setError(authErrorMessage(err, AUTH_MESSAGES.codeUnavailable));
    } finally {
      setBusy(false);
    }
  }

  async function handleProvider(provider: Provider) {
    if (!isLoaded || busy) return;
    setBusy(true);
    setPendingProvider(provider);
    setError("");
    try {
      await signUp.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: redirectUrl,
      });
    } catch (err) {
      setError(
        authErrorMessage(
          err,
          provider === "oauth_apple"
            ? "We couldn't complete Apple sign-up. Please try again."
            : AUTH_MESSAGES.socialSignInFailed
        )
      );
      setBusy(false);
      setPendingProvider(null);
    }
  }

  if (!isLoaded) {
    return <LoadingState message="Loading sign-up..." />;
  }

  return (
    <AuthCard
      heading={step === "verify" ? "Check your email" : "Create your account"}
      subheading={
        step === "verify"
          ? "Enter the code we emailed you to finish."
          : "Theta Tau, Delta Gamma"
      }
      footer={
        step === "details" ? (
          <>
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className={`${styles.quietLink} font-medium text-primary no-underline`}
            >
              Sign in
            </Link>
          </>
        ) : null
      }
    >
      <>
        {error ? (
          <Alert variant="destructive" className={`${styles.alert} mb-4`}>
            <CircleAlert className="size-4" aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {notice && !error ? (
          <Alert className={`${styles.alert} mb-4`}>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        <div key={step} className={styles.step}>
          {step === "details" ? (
            <form onSubmit={handleDetails} className="space-y-4">
              <div className={`${styles.rise} ${styles.d2} grid gap-2`}>
                <Button
                  type="button"
                  variant="outline"
                  className={`${styles.press} w-full gap-2`}
                  onClick={() => handleProvider("oauth_google")}
                  disabled={busy}
                >
                  {pendingProvider === "oauth_google" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <GoogleMark className={`${styles.providerMark} size-4`} />
                  )}
                  Continue with Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`${styles.press} w-full gap-2`}
                  onClick={() => handleProvider("oauth_apple")}
                  disabled={busy}
                >
                  {pendingProvider === "oauth_apple" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <AppleMark className={`${styles.providerMark} size-4`} />
                  )}
                  Continue with Apple
                </Button>
              </div>

              <div className={`${styles.rise} ${styles.d3} flex items-center gap-3`}>
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className={`${styles.rise} ${styles.d3} ${styles.field} grid gap-3 sm:grid-cols-2`}>
                <div className="space-y-2">
                  <Label htmlFor="first-name">First name</Label>
                  <Input
                    id="first-name"
                    name="given-name"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Last name</Label>
                  <Input
                    id="last-name"
                    name="family-name"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </div>
              </div>

              <div className={`${styles.rise} ${styles.d3} ${styles.field} space-y-2`}>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className={`${styles.rise} ${styles.d4} ${styles.field} space-y-2`}>
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@asu.edu"
                />
              </div>

              <div className={`${styles.rise} ${styles.d4} ${styles.field} space-y-2`}>
                <Label htmlFor="new-password">Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-password"
                    name="new-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={styles.press}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((shown) => !shown)}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Clerk attaches bot protection here when the instance has it
                * enabled; without the node, sign-up fails with no visible
                * cause. */}
              <div id="clerk-captcha" />

              <Button
                type="submit"
                className={`${styles.press} ${styles.rise} ${styles.d4} w-full gap-2`}
                disabled={busy}
              >
                {busy && !pendingProvider ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Create account
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className={`${styles.field} space-y-2`}>
                <Label htmlFor="signup-code">Verification code</Label>
                <Input
                  id="signup-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.4em]"
                />
              </div>
              <Button
                type="submit"
                className={`${styles.press} w-full gap-2`}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Verify and continue
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className={`${styles.quietLink} flex items-center gap-1 text-muted-foreground`}
                  onClick={() => {
                    setStep("details");
                    setError("");
                    setNotice("");
                  }}
                >
                  <ArrowLeft className="size-3" aria-hidden="true" />
                  Back
                </button>
                <button
                  type="button"
                  className={`${styles.quietLink} text-muted-foreground`}
                  onClick={resendCode}
                  disabled={busy}
                >
                  Send a new code
                </button>
              </div>
            </form>
          )}
        </div>
      </>
    </AuthCard>
  );
}
