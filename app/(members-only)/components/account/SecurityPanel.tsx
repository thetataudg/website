"use client";

// The "Security" half of the account dialog: the password, and everywhere the
// account is currently signed in.
//
// The device list is the member's own view of the same sessions the admin
// console shows under Sessions. Read through `user.getSessions()` rather than
// our admin route, because this one must work for every member and the admin
// route is deliberately closed to them.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import type { SessionActivity } from "@clerk/types";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { authErrorMessage } from "@/lib/clerkErrors";
import AccountRow from "./AccountRow";

type DeviceRow = {
  id: string;
  label: string;
  detail: string;
  where: string;
  when: string;
  isMobile: boolean;
  revoke: () => Promise<unknown>;
};

function formatWhen(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SecurityPanel({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const { user } = useUser();
  const { sessionId } = useAuth();

  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);

  const hasPassword = Boolean(user?.passwordEnabled);

  const loadDevices = useCallback(async () => {
    if (!user) return;
    try {
      const sessions = await user.getSessions();
      setDevices(
        sessions.map((session) => {
          // Typed rather than cast: the field names here (browserName,
          // deviceType, isMobile, city, country) are the ones Clerk actually
          // defines on SessionActivity, and a cast would hide a rename.
          const activity: Partial<SessionActivity> = session.latestActivity ?? {};
          const browser = [activity.browserName, activity.browserVersion]
            .filter(Boolean)
            .join(" ");
          return {
            id: session.id,
            label: activity.deviceType || browser || "Unknown device",
            detail: browser,
            where: [activity.city, activity.country].filter(Boolean).join(", "),
            when: formatWhen(session.lastActiveAt ?? null),
            isMobile: Boolean(activity.isMobile),
            revoke: () => session.revoke(),
          };
        })
      );
    } catch (err) {
      onError(authErrorMessage(err, "We couldn't load your devices."));
      setDevices([]);
    }
  }, [user, onError]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  if (!user) return null;

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      await user!.updatePassword({
        newPassword,
        // Only sent when there is one to check. Clerk rejects a current
        // password on an account that has never had one.
        ...(hasPassword ? { currentPassword } : {}),
        signOutOfOtherSessions: signOutOthers,
      });
      setEditingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      await loadDevices();
    } catch (err) {
      onError(
        authErrorMessage(err, "We couldn't update your password. Please try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeDevice(device: DeviceRow) {
    setBusy(true);
    onError("");
    try {
      await device.revoke();
      setDevices((rows) => (rows ?? []).filter((row) => row.id !== device.id));
    } catch (err) {
      onError(authErrorMessage(err, "We couldn't sign that device out."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <h2 className="m-0 mb-4 text-lg font-semibold text-foreground">Security</h2>

      <AccountRow
        label="Password"
        action={
          editingPassword ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingPassword(true)}
            >
              {hasPassword ? "Update password" : "Set password"}
            </Button>
          )
        }
      >
        {editingPassword ? (
          <form onSubmit={savePassword} className="space-y-3">
            {hasPassword ? (
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="account-new-password">New password</Label>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="sign-out-others"
                checked={signOutOthers}
                onCheckedChange={(value) => setSignOutOthers(value === true)}
              />
              <Label
                htmlFor="sign-out-others"
                className="text-xs font-normal text-muted-foreground"
              >
                Sign out of all other devices
              </Label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingPassword(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <span className="text-foreground">
            {hasPassword ? "••••••••••" : "No password set"}
          </span>
        )}
      </AccountRow>

      <AccountRow label="Active devices">
        {devices === null ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : devices.length === 0 ? (
          <span>No other devices.</span>
        ) : (
          <ul className="m-0 list-none space-y-4 p-0">
            {devices.map((device) => {
              const isCurrent = device.id === sessionId;
              const Icon = device.isMobile ? Smartphone : Monitor;
              return (
                <li key={device.id} className="flex items-start gap-3">
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 flex flex-wrap items-center gap-2 text-foreground">
                      {device.label}
                      {isCurrent ? (
                        <Badge variant="secondary">This device</Badge>
                      ) : null}
                    </p>
                    {device.detail ? (
                      <p className="m-0 text-xs">{device.detail}</p>
                    ) : null}
                    {device.where ? (
                      <p className="m-0 text-xs">{device.where}</p>
                    ) : null}
                    {device.when ? (
                      <p className="m-0 text-xs">{device.when}</p>
                    ) : null}
                  </div>
                  {/* No revoke on the current session: it would sign the
                    * member out of the dialog they are standing in. The
                    * account menu's Sign out is the deliberate way to do
                    * that. */}
                  {!isCurrent ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-destructive"
                      disabled={busy}
                      onClick={() => revokeDevice(device)}
                    >
                      <LogOut className="size-3" aria-hidden="true" />
                      Sign out
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </AccountRow>
    </div>
  );
}
