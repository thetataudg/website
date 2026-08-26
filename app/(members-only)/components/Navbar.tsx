"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ChevronDown, ExternalLink, Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";

type UserData = {
  rollNo: string | null;
  role: string | null;
  isCommitteeHead?: boolean;
  memberId: string | null;
  isECouncil?: boolean;
  status?: string;
  needsProfileReview?: boolean;
  needsPermissionReview?: boolean;
  pending?: boolean;
  pendingStatus?: string;
};

type Committee = {
  committeeHeadId?: string | { _id?: string };
};

type NavChild = {
  key: string;
  label: string;
  href: string;
  external?: boolean;
  separatorBefore?: boolean;
};

type NavItem = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  children?: NavChild[];
};

/* Gap between top-level nav items (NavigationMenuList uses space-x-1 = 4px)
 * and the breathing room we keep between the last visible item and the
 * right-hand actions. Both feed the overflow measurement below. */
const NAV_ITEM_GAP = 4;
const NAV_EDGE_GUTTER = 16;

// useLayoutEffect warns during SSR; the measurement only exists client-side.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function MemberNavbar() {
  const pathname = usePathname();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isCommitteeHead, setIsCommitteeHead] = useState(false);
  const [, setHasCommitteeMembership] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Force client-side mounting (prevents hydration mismatch on permission UI).
  useEffect(() => {
    setMounted(true);
  }, []);

  // fetch current user's rollNo & role
  useEffect(() => {
    if (!mounted) return;

    const fetchUserData = async () => {
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const isPending = Boolean(data.pending);

        setUserData({
          rollNo: data.rollNo,
          role: data.role,
          isCommitteeHead: data.isCommitteeHead,
          memberId: data.memberId,
          isECouncil: data.isECouncil,
          status: data.status || (isPending ? "Pending" : undefined),
          needsProfileReview: data.needsProfileReview ?? false,
          needsPermissionReview: data.needsPermissionReview ?? false,
          pending: isPending,
          pendingStatus: data.pendingStatus,
        });
      } catch (error) {
        console.error("Navbar: Fetch error:", error);
        setUserData({
          rollNo: null,
          role: null,
          isCommitteeHead: false,
          memberId: null,
          isECouncil: false,
          pending: true,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !userData?.memberId) return;
    const loadCommitteeHead = async () => {
      try {
        const res = await fetch(
          `/api/committees?memberId=${encodeURIComponent(userData.memberId!)}`
        );
        if (!res.ok) return;
        const committees: Committee[] = await res.json();
        const isHead = committees.some((c) => {
          const headId =
            typeof c.committeeHeadId === "string"
              ? c.committeeHeadId
              : c.committeeHeadId?._id;
          return headId === userData.memberId;
        });
        setIsCommitteeHead(isHead);
        setHasCommitteeMembership(
          Array.isArray(committees) && committees.length > 0
        );
      } catch (error) {
        console.error("Navbar: Committee head check failed:", error);
      }
    };
    loadCommitteeHead();
  }, [mounted, userData?.memberId]);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/member") return pathname === "/member";
      if (href === "/member/events") return pathname === "/member/events";
      return href !== "/" && pathname.startsWith(href);
    },
    [pathname]
  );

  const isWaiting =
    !userData ||
    userData.pending ||
    userData.needsPermissionReview ||
    userData.needsProfileReview;

  const handleMainSiteClick = useCallback(() => {
    if (typeof window === "undefined") return;
    const newTab = window.open("/", "_blank");
    if (newTab) {
      newTab.focus();
      setTimeout(() => {
        try {
          newTab.location.reload();
        } catch (err) {
          console.error("Navbar: Unable to reload main site tab", err);
        }
      }, 600);
    }
  }, []);

  // ---- permission derivations (identical to legacy Navbar.js) ----
  const canSeeCommitteeEvents =
    !!userData &&
    (userData.role === "admin" ||
      userData.role === "superadmin" ||
      !!userData.isECouncil ||
      !!userData.isCommitteeHead ||
      isCommitteeHead);
  const canSeeManageEvents =
    !!userData &&
    (userData.role === "admin" ||
      userData.role === "superadmin" ||
      !!userData.isECouncil);
  const isPrivilegedUser =
    !!userData &&
    (userData.role === "admin" ||
      userData.role === "superadmin" ||
      !!userData.isECouncil);
  const isAdmin =
    !!userData &&
    (userData.role === "admin" || userData.role === "superadmin");
  const canSeeGem = Boolean(userData?.memberId);
  /* Admin is a single link now, not a dropdown. Admins land on the roster (the
   * tab strip there covers everything, GEM included); E-Council members who are
   * not admins get no tab strip, so they go straight to the one admin page they
   * can use. */
  const adminHref = isAdmin ? "/member/admin/members" : "/member/admin/gem";
  const showEventsDropdown = canSeeCommitteeEvents || canSeeManageEvents;

  const profileHref = userData?.rollNo
    ? `/member/profile/${userData.rollNo}`
    : "/member/profile";

  /* One ordered list drives both the bar and the sheet: whatever does not fit
   * in the bar is what the hamburger shows, so the two never disagree. */
  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      { key: "home", label: "Home", href: "/member", active: isActive("/member") },
    ];

    if (isWaiting) return items;

    items.push({
      key: "profile",
      label: "My Profile",
      href: profileHref,
      active: isActive("/member/profile"),
    });

    if (isPrivilegedUser) {
      items.push({
        key: "admin",
        label: "Admin",
        href: adminHref,
        active: isActive("/member/admin"),
      });
    }

    items.push(
      {
        key: "brothers",
        label: "Brothers",
        href: "/member/brothers",
        active: isActive("/member/brothers"),
      },
      {
        key: "vote",
        label: "Vote",
        href: "/member/vote",
        active: isActive("/member/vote"),
      }
    );

    if (showEventsDropdown) {
      const children: NavChild[] = [
        { key: "events-all", label: "All Events", href: "/member/events" },
      ];
      if (canSeeManageEvents) {
        children.push({
          key: "events-manage",
          label: "Manage Events",
          href: "/member/events/manage",
        });
      }
      if (canSeeCommitteeEvents) {
        children.push({
          key: "events-committee",
          label: "Committee Events",
          href: "/member/events/committee",
        });
      }
      items.push({
        key: "events",
        label: "Events",
        href: "/member/events",
        active: isActive("/member/events"),
        children,
      });
    } else {
      items.push({
        key: "events",
        label: "Events",
        href: "/member/events",
        active: isActive("/member/events"),
      });
    }

    if (canSeeGem) {
      items.push({
        key: "gem",
        label: "GEM",
        href: "/member/gem",
        active: isActive("/member/gem"),
      });
    }

    items.push(
      {
        key: "committees",
        label: "Committees",
        href: "/member/committees",
        active: isActive("/member/committees"),
      },
      {
        key: "minutes",
        label: "Minutes",
        href: "/member/minutes",
        active: isActive("/member/minutes"),
      },
      {
        key: "dues",
        label: "Dues",
        href: "/member/dues",
        active: isActive("/member/dues"),
      },
      {
        key: "more",
        label: "More",
        href: "#",
        active: false,
        children: [
          { key: "more-soon", label: "Coming Soon", href: "#" },
          {
            key: "more-merch",
            label: "Merchandise",
            // Relative on purpose: /2dg4u is a redirect this app owns (see
            // next.config.mjs). Hardcoding the old apex sent members through an
            // extra cross-domain hop after the move to ttdg.org.
            href: "/2dg4u",
            external: true,
            separatorBefore: true,
          },
        ],
      }
    );

    return items;
  }, [
    isActive,
    isWaiting,
    profileHref,
    isPrivilegedUser,
    adminHref,
    showEventsDropdown,
    canSeeManageEvents,
    canSeeCommitteeEvents,
    canSeeGem,
  ]);

  /* Overflow measurement. The nav track is `flex-1 min-w-0`, so its width comes
   * from the free space left by the brand and the actions — never from its own
   * children — which keeps this from oscillating. The hidden row renders every
   * item at full width so we can measure items that are currently collapsed. */
  const navTrackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const track = navTrackRef.current;
    const row = measureRef.current;
    if (!track || !row) return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const available = track.clientWidth - NAV_EDGE_GUTTER;
      let used = 0;
      let count = 0;
      for (const child of Array.from(row.children)) {
        const width = (child as HTMLElement).offsetWidth;
        const next = used + width + (count > 0 ? NAV_ITEM_GAP : 0);
        if (next > available) break;
        used = next;
        count += 1;
      }
      setVisibleCount(count);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(track);

    // Web fonts can land after first paint and change the item widths.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [navItems]);

  const visibleItems = navItems.slice(0, visibleCount);
  const overflowItems = navItems.slice(visibleCount);
  const hasOverflow = overflowItems.length > 0;

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Loading shell — stable markup to avoid hydration mismatch.
  if (!mounted) {
    return (
      <header className="members-navbar-shell sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/member"
            className="font-semibold text-foreground no-underline"
          >
            ΔΓ Chapter Tools
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Initializing…</span>
            <UserButton />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="members-navbar-shell sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/member"
          className="shrink-0 font-semibold tracking-tight text-foreground no-underline"
        >
          ΔΓ Chapter Tools
        </Link>

        {visibleCount > 0 && (
          <div
            aria-hidden="true"
            className="ml-1 hidden h-6 w-px shrink-0 bg-border sm:block"
          />
        )}

        {/* Nav track: takes the leftover width, and only renders what fits. */}
        <div ref={navTrackRef} className="relative min-w-0 flex-1">
          {visibleItems.length > 0 && (
            <NavigationMenu
              aria-label="Member navigation"
              className="max-w-none justify-start"
              delayDuration={100}
              viewport={false}
            >
              <NavigationMenuList className="justify-start">
                {visibleItems.map((item) =>
                  item.children ? (
                    <NavDropdown
                      key={item.key}
                      label={item.label}
                      active={item.active}
                    >
                      {item.children.map((child) => (
                        <React.Fragment key={child.key}>
                          {child.separatorBefore && (
                            <li
                              role="separator"
                              aria-orientation="horizontal"
                              className="my-1 h-px bg-border"
                            />
                          )}
                          <MenuLink href={child.href} external={child.external}>
                            {child.label}
                          </MenuLink>
                        </React.Fragment>
                      ))}
                    </NavDropdown>
                  ) : (
                    <DesktopLink
                      key={item.key}
                      href={item.href}
                      active={item.active}
                    >
                      {item.label}
                    </DesktopLink>
                  )
                )}
              </NavigationMenuList>
            </NavigationMenu>
          )}

          {/* Off-layout copy of the full nav, used only for width measurement.
           * The 0×0 clipping wrapper keeps it from widening the document. */}
          <div
            aria-hidden="true"
            className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden"
          >
            <div
              ref={measureRef}
              className="flex w-max items-center space-x-1"
            >
              {navItems.map((item) => (
                <span key={item.key} className={navItemBase}>
                  {item.label}
                  {item.children && (
                    <ChevronDown className="relative top-px ml-1 size-3" />
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right-side actions */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMainSiteClick}
            className="hidden sm:inline-flex"
          >
            Main Site
          </Button>
          <NotificationBell />
          <ThemeToggle />
          <div
            aria-hidden="true"
            className="mx-1 hidden h-6 w-px bg-border sm:block"
          />
          <UserButton />

          {/* Overflow menu — holds whatever the bar could not fit. */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-9 w-9 shrink-0", !hasOverflow && "sm:hidden")}
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="members-navbar-shell w-80 overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav
                aria-label="More member navigation"
                className="mt-4 flex flex-col gap-1"
              >
                {overflowItems.map((item) =>
                  item.children ? (
                    <MobileSection key={item.key} label={item.label}>
                      {item.children.map((child) => (
                        <MobileLink
                          key={child.key}
                          href={child.href}
                          external={child.external}
                          active={!child.external && isActive(child.href)}
                          onNavigate={closeMobile}
                        >
                          {child.label}
                        </MobileLink>
                      ))}
                    </MobileSection>
                  ) : (
                    <MobileLink
                      key={item.key}
                      href={item.href}
                      active={item.active}
                      onNavigate={closeMobile}
                    >
                      {item.label}
                    </MobileLink>
                  )
                )}

                <div className="mt-4 border-t border-border pt-4 sm:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setMobileOpen(false);
                      handleMainSiteClick();
                    }}
                  >
                    Main Site
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/* ---------- shared nav-item styling ---------- */

// One base for every top-level nav item (links AND dropdown triggers) so they
// share radius, height, hover, and focus ring. `no-underline` overrides
// Bootstrap's reboot, which underlines all anchors. `shrink-0` keeps items at
// their measured width instead of squeezing when the track runs short.
const navItemBase = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "h-9 shrink-0 gap-1 px-3 font-medium no-underline whitespace-nowrap"
);

const navItemState = (active: boolean) =>
  active
    ? "bg-accent text-primary font-semibold hover:text-primary"
    : // Bright enough to read as a real destination on the dark bar
      // (9.8:1) rather than the dull muted-foreground grey (6.4:1).
      "text-foreground/80 hover:text-foreground hover:bg-accent";

/* ---------- desktop helpers ---------- */

function DesktopLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavigationMenuItem className="relative">
      <NavigationMenuLink asChild active={active}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(navItemBase, navItemState(active))}
        >
          {children}
        </Link>
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
}

function NavDropdown({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavigationMenuItem className="relative">
      <NavigationMenuTrigger
        data-active={active ? "" : undefined}
        className={cn(
          navItemBase,
          navItemState(active),
          "data-[state=open]:bg-accent data-[state=open]:text-foreground"
        )}
      >
        {label}
      </NavigationMenuTrigger>
      <NavigationMenuContent className="left-0 top-full mt-1.5 w-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
        <ul className="m-0 w-56 p-1">{children}</ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

function MenuLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="flex w-full cursor-pointer items-center rounded-sm px-3 py-2 text-sm font-medium text-popover-foreground no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        >
          {children}
          {external && <ExternalLink className="ml-auto size-3.5" />}
        </Link>
      </NavigationMenuLink>
    </li>
  );
}

/* ---------- mobile helpers ---------- */

function MobileLink({
  href,
  active,
  external,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  external?: boolean;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  const className = cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "h-10 w-full justify-start gap-2 px-3 font-medium no-underline",
    active
      ? "bg-accent text-primary font-semibold hover:text-primary"
      : "text-foreground/90 hover:text-foreground"
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        className={className}
      >
        {children}
        <ExternalLink className="size-3.5 opacity-70" />
      </a>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}

function MobileSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {/* Guide line runs down the nested items to show the hierarchy. */}
      <div className="ml-4 flex flex-col gap-1 border-l border-border pl-2">
        {children}
      </div>
    </div>
  );
}
