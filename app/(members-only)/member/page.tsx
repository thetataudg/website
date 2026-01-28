"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { RedirectToSignIn } from "@clerk/nextjs";
import axios from "axios";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTimes,
  faTriangleExclamation,
  faHourglass,
  faUser,
  faAddressCard,
  faNoteSticky,
  faCheckToSlot,
  faCalendar,
  faGear,
  faUsersCog,
} from "@fortawesome/free-solid-svg-icons";
import LoadingState, { LoadingSpinner } from "../components/LoadingState";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const [loadingUserData, setLoadingUserData] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const qrForegroundColor = "000000";
  const qrBackgroundColor = "fffaf4";
  const [checkInCode, setCheckInCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(0);
  const [codeError, setCodeError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isCommitteeHead, setIsCommitteeHead] = useState(false);
  const walletUrls = {
    google: "#",
    apple: "#",
  };

  const handleAddToWallet =
    (provider: keyof typeof walletUrls) => () => {
      window.open(walletUrls[provider], "_blank", "noopener");
    };

  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await axios.get("/api/members/me");
        const data = response.data;

        console.log("API /api/members/me response:", data);

        const isPending = Boolean(data.pending);
        const hasProfile = Boolean(data.memberId);
        const needsProfileReview = data.needsProfileReview ?? false;
        const needsPermissionReview = data.needsPermissionReview ?? false;
        setUserData({
          userHasProfile: hasProfile,
          pending: isPending,
          pendingStatus: data.pendingStatus,
          pendingDetails: isPending
            ? {
                pendingId: data.pendingId,
                submittedAt: data.pendingSubmittedAt,
                reviewedAt: data.pendingReviewedAt,
                reviewComments: data.pendingReviewComments,
              }
            : undefined,
          needsProfileReview,
          needsPermissionReview,
          type: isPending ? "Pending" : data.status, // Use the real status from API
          isECouncil: Boolean(data.isECouncil),
          isAdmin: data.role === "admin" || data.role === "superadmin",
          rollNo: data.rollNo,
          memberId: data.memberId,
        });

      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setNeedsOnboarding(true);
          router.replace("/member/onboard");
        } else {
          console.error("Error fetching user data:", error);
        }
        setUserData(null);
      } finally {
        setLoadingUserData(false);
      }
    }

    if (isSignedIn) fetchUserData();
  }, [isSignedIn]);

  useEffect(() => {
    if (needsOnboarding) {
      router.replace("/member/onboard");
    }
  }, [needsOnboarding, router]);

  useEffect(() => {
    if (!userData?.memberId) return;
    const loadCommitteeHead = async () => {
      try {
        const res = await fetch(
          `/api/committees?memberId=${encodeURIComponent(userData.memberId)}`
        );
        if (!res.ok) return;
        const committees = await res.json();
        const isHead = Array.isArray(committees)
          ? committees.some((c: any) => {
              const headId =
                typeof c.committeeHeadId === "string"
                  ? c.committeeHeadId
                  : c.committeeHeadId?._id;
              return headId === userData.memberId;
            })
          : false;
        setIsCommitteeHead(isHead);
      } catch (error) {
        console.error("Committee head check failed:", error);
      }
    };
    loadCommitteeHead();
  }, [userData?.memberId]);

  useEffect(() => {
    if (!showQr || !userData?.memberId) {
      setCheckInCode("");
      setCodeExpiresAt(null);
      setCodeError(null);
      return;
    }

    let mounted = true;
    const fetchCode = async () => {
      setQrLoading(true);
      setCheckInCode("");
      setCodeError(null);
      try {
        const res = await fetch("/api/checkin-code", { credentials: "include" });
        if (!res.ok) {
          throw new Error("Unable to generate code");
        }
        const payload = await res.json();
        if (!mounted) return;
        setCheckInCode(payload.code);
        setCodeExpiresAt(payload.expiresAt);
        setCodeError(null);
        const delay = Math.max(payload.expiresAt - Date.now() - 500, 0);
        refreshTimeoutRef.current && clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = setTimeout(fetchCode, delay);
      } catch (err: any) {
        if (!mounted) return;
        setCodeError(err?.message || "Failed to refresh check-in code");
      } finally {
        if (mounted) {
          setQrLoading(false);
        }
      }
    };

    fetchCode();

    return () => {
      mounted = false;
      refreshTimeoutRef.current && clearTimeout(refreshTimeoutRef.current);
    };
  }, [showQr, userData?.memberId]);

  useEffect(() => {
    if (!codeExpiresAt) {
      setSecondsUntilRefresh(0);
      return;
    }
    const update = () => {
      setSecondsUntilRefresh((prev) => {
        const seconds = Math.max(
          0,
          Math.ceil((codeExpiresAt - Date.now()) / 1000)
        );
        return seconds;
      });
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [codeExpiresAt]);

  if (!isLoaded || loadingUserData) {
    return <LoadingState message="Loading dashboard..." />;
  }

  if (needsOnboarding) {
    return (
      <LoadingState message="Redirecting to the onboarding form..." />
    );
  }

  if (!isSignedIn) {
    return (
      <div className="container">
        <div
          className="alert alert-danger d-flex align-items-center mt-5"
          role="alert"
        >
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>You must be logged in to use this function.</h3>
          <RedirectToSignIn />
        </div>
      </div>
    );
  }


  if (!userData || !userData.type) {
    // All accesses are false for unapproved users
    const privileges = [
      { label: "Edit Profile", access: false },
      { label: "Directory", access: false },
      { label: "Minutes", access: false },
      { label: "Vote", access: false },
      { label: "Admin Voting", access: false },
      { label: "Events", access: false },
      { label: "Admin Users", access: false },
    ];

    return (
      <div className="member-dashboard">
        <section className="member-hero bento-card">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <FontAwesomeIcon icon={faUsersCog} />
              Delta Gamma Member Hub
            </div>
            {user ? (
              <h1 className="hero-title">Welcome, {user.firstName}</h1>
            ) : (
              <h2 className="hero-title">Welcome, please enter your name</h2>
            )}
            <p className="hero-subtitle">
              Your membership access is still being verified.
            </p>
            <div className="hero-tags">
              <span className="tt-tag">Status: Pending</span>
              <span className="tt-tag">Profile review in progress</span>
            </div>
          </div>
          <div className="hero-spotlight bento-card">
            <div className="spotlight-icon">
              <FontAwesomeIcon icon={faHourglass} />
            </div>
            <div>
              <div className="spotlight-title">Awaiting approval</div>
              <div className="spotlight-meta">
                An officer will confirm your profile shortly.
              </div>
            </div>
          </div>
        </section>

        <section className="bento-card status-bar">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </span>
            Status updates
          </div>
          <div className="status-grid">
            <div className="status-card info">
              <FontAwesomeIcon icon={faHourglass} />
              <div>
                Your profile is not yet approved. Please contact an officer if
                you believe this is an error.
              </div>
            </div>
          </div>
        </section>

        <div className="bento-grid">
          <section className="bento-card bento-permissions">
            <div className="bento-title">
              <span className="icon-pill">
                <FontAwesomeIcon icon={faCheck} />
              </span>
              My permissions
            </div>
            <div className="perm-list">
              {privileges.map((priv, index) => (
                <div className="perm-item" key={index}>
                  <span>{priv.label}</span>
                  <FontAwesomeIcon
                    icon={priv.access ? faCheck : faTimes}
                    className={`status-icon ${
                      priv.access ? "text-success" : "text-danger"
                    }`}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const {
    userHasProfile,
    type,
    isECouncil,
    isAdmin,
    needsPermissionReview,
    needsProfileReview,
    rollNo,
  } = userData;

  const userTypeDetails = [
    isAdmin && "Admin",
    isECouncil && "E-Council",
    needsPermissionReview && "access pending",
  ]
    .filter(Boolean)
    .join(", ");

  const privileges = [
    { label: "Edit Profile", access: userHasProfile },
    { label: "Directory", access: userHasProfile },
    { label: "Minutes", access: userHasProfile },
    { label: "Vote", access: userHasProfile && type === "Active" },
    { label: "Admin Voting", access: isECouncil },
    { label: "Events", access: userHasProfile },
    { label: "Admin Users", access: isAdmin },
  ];

  // Quick access buttons
  const quickAccessButtons = [
    {
      label: "My Profile",
      href: rollNo ? `/member/profile/${rollNo}` : "#",
      icon: faUser,
      enabled: userHasProfile,
      variant: "primary",
    },
    {
      label: "Brothers",
      href: "/member/brothers",
      icon: faAddressCard,
      enabled: userHasProfile,
      variant: "success",
    },
    {
      label: "Minutes",
      href: "/member/minutes",
      icon: faNoteSticky,
      enabled: userHasProfile,
      variant: "info",
    },
    // {
    //   label: "Minutes",
    //   href: "/member/minutes",
    //   icon: faNoteSticky,
    //   enabled: userHasProfile,
    //   variant: "info",
    // },
    {
      label: "Vote",
      href: "/member/vote",
      icon: faCheckToSlot,
      enabled: userHasProfile && type === "Active",
      variant: "warning",
    },
    {
       label: "Events",
       href: "/member/events",
       icon: faCalendar,
       enabled: userHasProfile,
       variant: "secondary",
    }, 
    {
      label: "Admin",
      href: "/member/admin",
      icon: faGear,
      enabled: isAdmin,
      variant: "danger",
    },
    {
      label: "Manage Events",
      href: "/member/events/manage",
      icon: faCalendar,
      enabled: (isAdmin || isECouncil) && userHasProfile,
      variant: "secondary",
    },
    {
      label: "Committee Events",
      href: "/member/events/committee",
      icon: faCalendar,
      enabled: (isAdmin || isECouncil || isCommitteeHead) && userHasProfile,
      variant: "secondary",
    },
  ];

  const statusUpdates: { type: "alert" | "info" | "success"; icon: any; text: string }[] = [];
  if (!userHasProfile) {
    statusUpdates.push({
      type: "alert",
      icon: faTriangleExclamation,
      text: "You do not have access to this tool yet. Please contact an admin if you believe this is an error.",
    });
  }
  if (needsPermissionReview) {
    statusUpdates.push({
      type: "info",
      icon: faHourglass,
      text: "Since you marked yourself as E-Council, your extended permissions are being verified.",
    });
  }
  if (needsProfileReview && !needsPermissionReview) {
    statusUpdates.push({
      type: "info",
      icon: faHourglass,
      text: "Your profile changes are awaiting review.",
    });
  }
  if (userHasProfile && !needsPermissionReview && !needsProfileReview) {
    statusUpdates.push({
      type: "success",
      icon: faCheck,
      text: `Your profile is ${
        type === "Active" ? "active" : type.toLowerCase()
      }, granting ${
        isAdmin
          ? "admin privileges"
          : isECouncil
          ? "extended privileges"
          : "normal privileges"
      } on the chapter tool.`,
    });
  }

  return (
    <div className="member-dashboard">
      <section className="member-hero bento-card">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <FontAwesomeIcon icon={faUsersCog} />
            Delta Gamma Member Hub
          </div>
          {user ? (
            <h1 className="hero-title">Welcome, {user.firstName}</h1>
          ) : (
            <h2 className="hero-title">Welcome, please enter your name</h2>
          )}
          <div className="hero-tags">
            <span className="tt-tag">Status: {type}</span>
            {userTypeDetails && <span className="tt-tag">{userTypeDetails}</span>}
          </div>
        </div>
        <div className="hero-spotlight bento-card">
          {userData?.memberId ? (
            <button
              className="tt-btn tt-btn-primary tt-btn-compact"
              onClick={() => setShowQr(true)}
              type="button"
            >
              <FontAwesomeIcon icon={faCheckToSlot} />
              My Check-In Code
            </button>
          ) : (
            <div className="spotlight-meta">
              Check-in code unlocks after your profile is verified.
            </div>
          )}
        </div>
      </section>

      {statusUpdates.length > 0 && (
        <section className="bento-card status-bar">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faNoteSticky} />
            </span>
            Status updates
          </div>
          <div className="status-grid">
            {statusUpdates.map((update, index) => (
              <div className={`status-card ${update.type}`} key={index}>
                <FontAwesomeIcon icon={update.icon} />
                <div>{update.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="bento-grid">
        <section className="bento-card bento-quick">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faAddressCard} />
            </span>
            Quick access
          </div>
          <div className="quick-grid">
            {quickAccessButtons
              .filter((button) => button.enabled)
              .map((button, index) => (
                <Link href={button.href} className="quick-card" key={index}>
                  <span className="quick-icon">
                    <FontAwesomeIcon icon={button.icon} />
                  </span>
                  <span className="quick-label">{button.label}</span>
                </Link>
              ))}
          </div>
        </section>

        <section className="bento-card bento-permissions">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faGear} />
            </span>
            Permissions
          </div>
          <div className="perm-list">
            {privileges.map((priv, index) => (
              <div className="perm-item" key={index}>
                <span>{priv.label}</span>
                <FontAwesomeIcon
                  icon={priv.access ? faCheck : faTimes}
                  className={`status-icon ${
                    priv.access ? "text-success" : "text-danger"
                  }`}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      {showQr && userData?.memberId && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content qr-modal">
              <div className="modal-header">
                <h5 className="modal-title">My Check-In Code</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowQr(false)}
                />
              </div>
              <div className="modal-body text-center">
                {qrLoading ? (
                  <div className="qr-loading">
                    <LoadingSpinner size="2x" />
                    <span className="text-muted">Loading QR code...</span>
                  </div>
                ) : checkInCode ? (
                  <div className="qr-code-wrapper">
                    <img
                      alt="Member QR Code"
                      className="qr-code"
                      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                        checkInCode
                      )}&size=480x480&color=${qrForegroundColor}&bgcolor=${qrBackgroundColor}`}
                      onLoad={() => setQrLoading(false)}
                      onError={() => setQrLoading(false)}
                      style={{ opacity: qrLoading ? 0 : 1 }}
                    />
                  </div>
                ) : (
                  <div className="qr-loading" style={{ marginTop: 24 }}>
                    <span className="text-muted">
                      {codeError || "Generating QR code..."}
                    </span>
                  </div>
                )}
                <p className="text-muted mt-3">
                  Show this at event check-in.
                  {secondsUntilRefresh > 0 ? (
                    <> (refreshes in {secondsUntilRefresh}s)</>
                  ) : (
                    <> (refreshing...)</>
                  )}
                </p>
                
                {/*
                <button
                  type="button"
                  className="wallet-btn wallet-btn--google"
                  onClick={handleAddToWallet("google")}
                >
                  <span className="wallet-icon" aria-hidden="true">
                    <img src="/google_wallet.svg" alt="" />
                  </span>
                  Add to Google Wallet
                </button>
                <button
                  type="button"
                  className="wallet-btn wallet-btn--apple"
                  onClick={handleAddToWallet("apple")}
                >
                  <span className="wallet-icon" aria-hidden="true">
                    <img src="/apple_wallet.svg" alt="" />
                  </span>
                  Add to Apple Wallet
                </button>
                */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
