"use client";

// The chapter's sign-in form.
//
// Clerk's `useSignIn` is headless: it owns the protocol, we own every pixel.
// The state machine below is the same one the iOS app walks in
// `ClerkClient.signIn` — password, then an email code when the instance asks
// for a second factor, then activate the session — because both clients talk
// to the same instance and hit the same branches. Keeping them in step is what
// stops a member being told two different things on two devices.
//
// Four states, one at a time:
//   password → the ordinary path
//   code     → the instance asked for a second factor
//   forgot   → send a reset code
//   reset    → set a new password with that code

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { ArrowLeft, CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "../(members-only)/components/LoadingState";
import { AUTH_MESSAGES, authErrorMessage } from "@/lib/clerkErrors";
import {
  LOGOUT_REASONS,
  LOGOUT_TONE_CLASSES,
  parseLogoutReason,
} from "@/components/auth/logoutReason";
import AuthCard from "@/components/auth/AuthCard";
import { AppleMark, GoogleMark } from "@/components/auth/BrandIcons";
import styles from "@/components/auth/auth.module.css";

type Step = "password" | "code" | "forgot" | "reset";
type Provider = "oauth_google" | "oauth_apple";

/// Where a member without an account is sent. `/sign-up` collects the Clerk
/// account and then hands off to /member/onboard for the invitation details,
/// so linking straight to onboard would skip the half that creates the login.
const SIGN_UP_URL = "/sign-up";

/// Where to land after signing in. An open redirect here would let a phishing
/// link borrow the chapter's sign-in page and bounce the member anywhere, so
/// only same-origin paths are honoured.
function safeRedirect(value: string): string {
  if (!value) return "/member";
  try {
    // Absolute URLs are allowed only if they point back at this origin.
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/member";
    return `${url.pathname}${url.search}${url.hash}` || "/member";
  } catch {
    return "/member";
  }
}

export default function SignInWorkspace({
  redirectUrl,
  logoutReason,
}: {
  redirectUrl: string;
  /// The `?logout=` value, read on the server and handed down rather than
  /// pulled from `useSearchParams`, which would need its own Suspense
  /// boundary for no benefit.
  logoutReason?: string;
}) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [step, setStep] = useState<Step>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [codeDestination, setCodeDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const destination = useMemo(() => safeRedirect(redirectUrl), [redirectUrl]);

  const reason = parseLogoutReason(logoutReason);

  // Nothing on these pages takes focus on its own — not on load, and not when
  // the step changes. Moving the caret without being asked steals the next
  // keystroke, and it fights password managers and screen readers, which
  // announce from wherever focus lands.

  const finish = useCallback(
    async (createdSessionId: string) => {
      await setActive?.({ session: createdSessionId });
      router.push(destination);
    },
    [setActive, router, destination]
  );

  /// Email is the only second factor the chapter's instance issues, and the
  /// only one the iOS app handles. Anything else needs a human.
  const startEmailSecondFactor = useCallback(async () => {
    const factor = signIn?.supportedSecondFactors?.find(
      (candidate: any) => candidate.strategy === "email_code"
    ) as any;

    if (!factor) {
      setError(AUTH_MESSAGES.codeUnavailable);
      return;
    }

    await signIn!.prepareSecondFactor({
      strategy: "email_code",
      emailAddressId: factor.emailAddressId,
    });
    setCodeDestination(factor.safeIdentifier ?? "your email");
    setCode("");
    setStep("code");
  }, [signIn]);

  async function handlePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!isLoaded || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const attempt = await signIn.create({
        identifier: identifier.trim(),
        password,
      });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await finish(attempt.createdSessionId);
        return;
      }

      // A resolved request is not necessarily a session: Clerk returns a
      // SignIn for every completed *step*. Treating "resolved" as "signed in"
      // is the bug that bounced the iOS app straight back to its welcome
      // screen, and the same trap is here.
      if (attempt.status === "needs_second_factor") {
        await startEmailSecondFactor();
        return;
      }

      if (attempt.status === "needs_new_password") {
        setNotice("You need to set a new password before signing in.");
        setStep("reset");
        return;
      }

      setError(AUTH_MESSAGES.incomplete);
    } catch (err) {
      setError(authErrorMessage(err, AUTH_MESSAGES.signInFailed));
    } finally {
      setBusy(false);
    }
  }

  async function handleCode(event: React.FormEvent) {
    event.preventDefault();
    if (!isLoaded || busy) return;

    setBusy(true);
    setError("");

    try {
      const attempt = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code: code.trim(),
      });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await finish(attempt.createdSessionId);
        return;
      }
      setError(AUTH_MESSAGES.codeIncorrect);
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
      await startEmailSecondFactor();
      setNotice("We sent a new code.");
    } catch (err) {
      setError(authErrorMessage(err, AUTH_MESSAGES.codeUnavailable));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    if (!isLoaded || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: identifier.trim(),
      });
      setCode("");
      setNewPassword("");
      setStep("reset");
      setNotice("Check your email for a reset code.");
    } catch (err) {
      setError(authErrorMessage(err, AUTH_MESSAGES.codeUnavailable));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    if (!isLoaded || busy) return;

    setBusy(true);
    setError("");

    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password: newPassword,
      });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await finish(attempt.createdSessionId);
        return;
      }
      // A reset can still land on a second factor.
      if (attempt.status === "needs_second_factor") {
        await startEmailSecondFactor();
        return;
      }
      setError(AUTH_MESSAGES.incomplete);
    } catch (err) {
      setError(authErrorMessage(err, AUTH_MESSAGES.codeIncorrect));
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
      // No account-chooser option is passed, because Clerk does not expose
      // one. `AuthenticateWithRedirectParams` has no field for the OIDC
      // `prompt`, in the installed @clerk/types (4.101.23) or in the latest
      // published one, and an extra key is dropped rather than forwarded —
      // verified by reading the outbound Google URL, which carries no
      // `prompt` parameter. Which account Google offers is settled by the
      // OAuth credentials on the Clerk connection, not from here.
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: destination,
      });
      // No cleanup: the browser is leaving for the provider.
    } catch (err) {
      setError(
        authErrorMessage(
          err,
          provider === "oauth_apple"
            ? "We couldn't complete Apple sign-in. Please try again."
            : AUTH_MESSAGES.socialSignInFailed
        )
      );
      setBusy(false);
      setPendingProvider(null);
    }
  }

  if (!isLoaded) {
    return <LoadingState message="Loading sign-in..." />;
  }

  const heading =
    step === "forgot"
      ? "Reset your password"
      : step === "reset"
        ? "Choose a new password"
        : step === "code"
          ? "Check your email"
          : "Chapter Tools";

  const subheading =
    step === "code"
      ? `We sent a code to ${codeDestination}.`
      : step === "forgot"
        ? "We'll email you a code to set a new one."
        : step === "reset"
          ? "Enter the code we emailed you, then your new password."
          : "Theta Tau, Delta Gamma";

  return (
    <AuthCard
      heading={heading}
      subheading={subheading}
      footer={
        step === "password" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link
              href={SIGN_UP_URL}
              className={`${styles.quietLink} font-medium text-primary no-underline`}
            >
              Sign up
            </Link>
          </>
        ) : null
      }
    >
      <>
        {/* One tinted line above the form. Not an Alert: no icon, no heading,
          * no border — the member is already looking at the thing that fixes
          * it, and anything larger just pushes the email field down. */}
        {reason && !error ? (
          <p
            className={cn(
              styles.alert,
              "m-0 mb-5 rounded-lg px-4 py-2.5 text-center text-sm",
              LOGOUT_TONE_CLASSES[LOGOUT_REASONS[reason].tone]
            )}
          >
            {LOGOUT_REASONS[reason].message}
          </p>
        ) : null}

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

        {/* Keyed on the step so React remounts the form and replays the
          * transition. Without the key the fields swap in place, which reads
          * as a glitch rather than a change of screen. */}
        <div key={step} className={styles.step}>
          {step === "password" ? (
            <form onSubmit={handlePassword} className="space-y-4">
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

              <div
                className={`${styles.rise} ${styles.d3} flex items-center gap-3`}
              >
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className={`${styles.rise} ${styles.d3} ${styles.field} space-y-2`}>
                <Label htmlFor="identifier">Email address or username</Label>
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="you@asu.edu"
                />
              </div>

              <div className={`${styles.rise} ${styles.d4} ${styles.field} space-y-2`}>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    className={`${styles.quietLink} text-xs text-muted-foreground`}
                    onClick={() => {
                      setStep("forgot");
                      setError("");
                      setNotice("");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                {/* The reveal toggle is a real button, not an icon overlay, so
                  * it is reachable by keyboard and announced by screen
                  * readers. */}
                <div className="flex gap-2">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
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

              {/* Clerk's bot protection attaches itself to this node when the
                * instance has it enabled. Without it, sign-in fails on a
                * protected instance with no visible cause. */}
              <div id="clerk-captcha" />

              <Button
                type="submit"
                className={`${styles.press} ${styles.rise} ${styles.d4} w-full gap-2`}
                disabled={busy}
              >
                {busy && !pendingProvider ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Sign in
              </Button>
            </form>
          ) : null}

          {step === "code" ? (
            <form onSubmit={handleCode} className="space-y-4">
              <div className={`${styles.field} space-y-2`}>
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
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
                Verify and sign in
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className={`${styles.quietLink} text-muted-foreground`}
                  onClick={() => setStep("password")}
                >
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
          ) : null}

          {step === "forgot" ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className={`${styles.field} space-y-2`}>
                <Label htmlFor="reset-identifier">Email address</Label>
                <Input
                  id="reset-identifier"
                  name="identifier"
                  type="email"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
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
                Send reset code
              </Button>
              <button
                type="button"
                className={`${styles.quietLink} mx-auto flex items-center justify-center gap-1 text-xs text-muted-foreground`}
                onClick={() => {
                  setStep("password");
                  setError("");
                  setNotice("");
                }}
              >
                <ArrowLeft className="size-3" aria-hidden="true" />
                Back to sign in
              </button>
            </form>
          ) : null}

          {step === "reset" ? (
            <form onSubmit={handleReset} className="space-y-4">
              <div className={`${styles.field} space-y-2`}>
                <Label htmlFor="reset-code">Reset code</Label>
                <Input
                  id="reset-code"
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
              <div className={`${styles.field} space-y-2`}>
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
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
                Set password and sign in
              </Button>
              <button
                type="button"
                className={`${styles.quietLink} mx-auto flex items-center justify-center gap-1 text-xs text-muted-foreground`}
                onClick={() => {
                  setStep("password");
                  setError("");
                  setNotice("");
                }}
              >
                <ArrowLeft className="size-3" aria-hidden="true" />
                Back to sign in
              </button>
            </form>
          ) : null}
        </div>

      </>
    </AuthCard>
  );
}
