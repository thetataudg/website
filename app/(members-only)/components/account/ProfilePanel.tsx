"use client";

// The "Profile" half of the account dialog: who the account says you are, and
// the identifiers you can sign in with.
//
// Every mutation goes through Clerk's client SDK on the user resource, so this
// is a different surface over the same data Clerk's own screen edited — no new
// endpoints, and nothing to keep in sync.

import { useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppleMark, GoogleMark } from "@/components/auth/BrandIcons";
import { authErrorMessage } from "@/lib/clerkErrors";
import AccountRow from "./AccountRow";

type OpenForm = "none" | "profile" | "username" | "email";

/// Providers the chapter's instance offers. Anything else a member has linked
/// still lists and still unlinks; only the "connect" buttons are limited to
/// what we actually support.
const PROVIDERS = [
  { strategy: "oauth_google" as const, label: "Google", Mark: GoogleMark },
  { strategy: "oauth_apple" as const, label: "Apple", Mark: AppleMark },
];

export default function ProfilePanel({
  initials,
  onError,
}: {
  initials: string;
  onError: (message: string) => void;
}) {
  const { user } = useUser();

  const [open, setOpen] = useState<OpenForm>("none");
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const close = () => {
    setOpen("none");
    setNewEmail("");
    setEmailCode("");
    setVerifyingId(null);
  };

  async function run(work: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    onError("");
    try {
      await work();
      return true;
    } catch (err) {
      onError(authErrorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        user!.update({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      "We couldn't save your name. Please try again."
    );
    if (ok) close();
  }

  async function saveUsername(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(
      () => user!.update({ username: username.trim() }),
      "We couldn't save that username. It may already be taken."
    );
    if (ok) close();
  }

  async function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared immediately so choosing the same file twice still fires a change.
    event.target.value = "";
    if (!file) return;
    await run(
      () => user!.setProfileImage({ file }),
      "We couldn't upload that image. Please try another."
    );
  }

  /// Adding an address is two steps: create it, then prove it. Clerk will not
  /// let an unverified address become primary, so the code cannot be skipped.
  async function addEmail(event: React.FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      const created = await user!.createEmailAddress({ email: newEmail.trim() });
      await created.prepareVerification({ strategy: "email_code" });
      setVerifyingId(created.id);
    }, "We couldn't add that address. Please try again.");
    if (!ok) setVerifyingId(null);
  }

  async function verifyEmail(event: React.FormEvent) {
    event.preventDefault();
    const record = user!.emailAddresses.find((entry) => entry.id === verifyingId);
    if (!record) return;
    const ok = await run(
      () => record.attemptVerification({ code: emailCode.trim() }),
      "That code wasn't accepted. Check the code and try again."
    );
    if (ok) close();
  }

  return (
    <div className="space-y-1">
      <h2 className="m-0 mb-4 text-lg font-semibold text-foreground">
        Profile details
      </h2>

      <AccountRow
        label="Profile"
        action={
          open === "profile" ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen("profile")}
            >
              Update profile
            </Button>
          )
        }
      >
        {open === "profile" ? (
          <form onSubmit={saveProfile} className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                {user.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                Change photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickImage}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="account-first">First name</Label>
                <Input
                  id="account-first"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-last">Last name</Label>
                <Input
                  id="account-last"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              {user.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-foreground">
              {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                "No name set"}
            </span>
          </div>
        )}
      </AccountRow>

      <AccountRow
        label="Username"
        action={
          open === "username" ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen("username")}
            >
              Update username
            </Button>
          )
        }
      >
        {open === "username" ? (
          <form onSubmit={saveUsername} className="space-y-3">
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              aria-label="Username"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <span className="text-foreground">{user.username || "Not set"}</span>
        )}
      </AccountRow>

      <AccountRow label="Email addresses">
        <ul className="m-0 list-none space-y-2 p-0">
          {user.emailAddresses.map((entry) => {
            const isPrimary = entry.id === user.primaryEmailAddressId;
            const isVerified = entry.verification?.status === "verified";
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-2">
                <span className="text-foreground">{entry.emailAddress}</span>
                {isPrimary ? <Badge variant="secondary">Primary</Badge> : null}
                {!isVerified ? (
                  <Badge variant="outline">Unverified</Badge>
                ) : null}
                {!isPrimary && isVerified ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => user.update({ primaryEmailAddressId: entry.id }),
                        "We couldn't change your primary address."
                      )
                    }
                  >
                    <Check className="size-3" aria-hidden="true" />
                    Make primary
                  </Button>
                ) : null}
                {/* The primary address has no remove button: Clerk rejects the
                  * call, and an action that always fails is worse than none. */}
                {!isPrimary ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-destructive"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => entry.destroy(),
                        "We couldn't remove that address."
                      )
                    }
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                    Remove
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {verifyingId ? (
          <form onSubmit={verifyEmail} className="mt-3 space-y-2">
            <Alert>
              <AlertDescription>
                We sent a code to that address. Enter it to finish.
              </AlertDescription>
            </Alert>
            <Input
              value={emailCode}
              onChange={(event) => setEmailCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label="Verification code"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        ) : open === "email" ? (
          <form onSubmit={addEmail} className="mt-3 space-y-2">
            <Input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="you@asu.edu"
              aria-label="New email address"
              required
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Send code
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 gap-1 px-0 text-xs"
            onClick={() => setOpen("email")}
          >
            <Plus className="size-3" aria-hidden="true" />
            Add email address
          </Button>
        )}
      </AccountRow>

      <AccountRow label="Connected accounts">
        <ul className="m-0 list-none space-y-2 p-0">
          {user.externalAccounts.length === 0 ? (
            <li className="text-muted-foreground">None connected.</li>
          ) : null}
          {user.externalAccounts.map((account) => {
            const known = PROVIDERS.find(
              (entry) => entry.strategy === `oauth_${account.provider}`
            );
            const Mark = known?.Mark;
            return (
              <li key={account.id} className="flex flex-wrap items-center gap-2">
                {Mark ? <Mark className="size-4" /> : null}
                <span className="font-medium text-foreground">
                  {known?.label ?? account.provider}
                </span>
                <span className="truncate">
                  {account.emailAddress || account.username || ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-destructive"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => account.destroy(),
                      "We couldn't disconnect that account."
                    )
                  }
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                  Disconnect
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          {PROVIDERS.filter(
            (provider) =>
              !user.externalAccounts.some(
                (account) => `oauth_${account.provider}` === provider.strategy
              )
          ).map(({ strategy, label, Mark }) => (
            <Button
              key={strategy}
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    user.createExternalAccount({
                      strategy,
                      redirectUrl: window.location.href,
                    }).then((account) => {
                      // Clerk hands back a URL to send the member to; the
                      // account is not linked until they come back from it.
                      const url =
                        account.verification?.externalVerificationRedirectURL;
                      if (url) window.location.href = url.toString();
                    }),
                  `We couldn't start ${label} sign-in. Please try again.`
                )
              }
            >
              <Mark className="size-4" />
              Connect {label}
            </Button>
          ))}
        </div>
      </AccountRow>
    </div>
  );
}
