"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingState from "../../components/LoadingState";
import { PageContainer } from "../../components/shell/PageShell";

const ADMIN_TABS = [
  { href: "/member/admin/members", label: "Members" },
  { href: "/member/admin/profiles", label: "Profiles" },
  { href: "/member/admin/family-tree", label: "Family tree" },
  { href: "/member/admin/committees", label: "Committees" },
  { href: "/member/admin/invite", label: "Invite" },
  { href: "/member/admin/pending", label: "Requests" },
  { href: "/member/admin/dues", label: "Dues" },
  { href: "/member/admin/gem", label: "GEM" },
  { href: "/member/admin/lockdown", label: "Lockdown" },
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [me, setMe] = useState<{
    role: string;
    rollNo: string;
    isECouncil: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch("/api/members/me")
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setMe({
          role: data.role,
          rollNo: data.rollNo,
          isECouncil: data.isECouncil,
        });
      })
      .catch(() => {
        if (active) setMe(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <LoadingState message="Loading admin console..." />;

  const isAdmin = Boolean(
    me && (me.role === "admin" || me.role === "superadmin")
  );
  const isPrivileged = Boolean(isAdmin || me?.isECouncil);

  if (!isPrivileged) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <ShieldAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Unauthorized</AlertTitle>
          <AlertDescription>
            You do not have access to the chapter administration console.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (!isAdmin) return children;

  const activeTab =
    ADMIN_TABS.find((tab) => pathname.startsWith(tab.href))?.href ??
    ADMIN_TABS[0].href;

  return (
    <Tabs value={activeTab} className="w-full">
      <PageContainer className="max-w-7xl pb-0">
        <div className="overflow-x-auto pb-1" aria-label="Admin console sections">
          <TabsList className="h-auto min-w-max justify-start">
            {/* Rendered as real links, not value-only triggers: Radix does not
              * fire `onValueChange` when the active tab is clicked again, so on
              * a sub-route like /dues/requests (which resolves to the Dues tab)
              * clicking Dues did nothing and there was no way back. Links also
              * restore cmd-click and middle-click. */}
            {ADMIN_TABS.map((tab) => (
              <TabsTrigger
                key={tab.href}
                value={tab.href}
                className="shrink-0 px-4 text-muted-foreground no-underline"
                asChild
              >
                <Link href={tab.href} className="no-underline">
                  {tab.label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </PageContainer>

      <TabsContent value={activeTab} className="mt-0" forceMount>
        {children}
      </TabsContent>
    </Tabs>
  );
}
