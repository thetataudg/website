"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, History, PenSquare, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingState from "../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import ComposePanel from "./ComposePanel";
import HistoryPanel from "./HistoryPanel";
import type { Roster } from "./types";

export default function NotificationCenterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") === "history" ? "history" : "compose";
  const openId = params.get("id");

  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/notification-center")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) setError({ status: res.status, message: data.error || "Could not load." });
        else setRoster(data);
      })
      .catch(() => active && setError({ status: 0, message: "Could not load." }));
    return () => {
      active = false;
    };
  }, []);

  const navigate = useCallback(
    (next: { tab?: string; id?: string | null }) => {
      const search = new URLSearchParams();
      const nextTab = next.tab ?? tab;
      if (nextTab === "history") search.set("tab", "history");
      const nextId = next.id === undefined ? openId : next.id;
      if (nextTab === "history" && nextId) search.set("id", nextId);
      const query = search.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [openId, pathname, router, tab]
  );

  if (error) {
    return (
      <PageContainer className="max-w-7xl">
        <Alert variant="destructive">
          <ShieldAlert className="size-4" aria-hidden="true" />
          <AlertTitle>{error.status === 403 ? "Restricted" : "Something went wrong"}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }
  if (!roster) return <LoadingState message="Loading Notification Center..." />;

  return (
    <PageContainer className="max-w-7xl">
      <Toaster />
      <PageHeader
        eyebrow={
          <Button variant="link" asChild className="h-auto p-0 text-muted-foreground">
            <Link href="/member/admin/members" className="inline-flex items-center gap-1 no-underline">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Member administration
            </Link>
          </Button>
        }
        title="Notification Center"
        description="Send a push, in-app notification or email to anyone in the chapter."
      />

      <Tabs value={tab} onValueChange={(value) => navigate({ tab: value, id: null })}>
        <TabsList className="mb-6">
          <TabsTrigger value="compose" className="gap-2">
            <PenSquare className="size-4" aria-hidden="true" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="size-4" aria-hidden="true" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" forceMount className="data-[state=inactive]:hidden">
          <ComposePanel
            roster={roster}
            onSent={(id) => {
              setRefreshKey((key) => key + 1);
              navigate({ tab: "history", id });
            }}
          />
        </TabsContent>
        <TabsContent value="history">
          <HistoryPanel
            openId={openId}
            onOpenChange={(id) => navigate({ tab: "history", id })}
            refreshKey={refreshKey}
          />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
