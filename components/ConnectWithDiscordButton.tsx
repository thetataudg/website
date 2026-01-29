"use client";

import { ButtonHTMLAttributes, MouseEvent, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";

export interface ConnectWithDiscordButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  redirectTo?: string;
  label?: string;
  renderLabel?: (state: { isRedirecting: boolean }) => React.ReactNode;
}

export default function ConnectWithDiscordButton({
  redirectTo,
  label = "Connect with Discord",
  renderLabel,
  className,
  onClick,
  disabled,
  ...rest
}: ConnectWithDiscordButtonProps) {
  const [redirecting, setRedirecting] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const targetUrl = useMemo(() => {
    if (redirectTo) return redirectTo;
    const path = pathname || "/member";
    const query = searchParams?.toString();
    const base = `${path}${query ? `?${query}` : ""}` || "/member";
    return base;
  }, [pathname, searchParams, redirectTo]);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (disabled || redirecting) return;
    setRedirecting(true);
    if (typeof window !== "undefined") {
      window.location.href = `/api/discord/link?redirectTo=${encodeURIComponent(
        targetUrl
      )}`;
    }
  };

  const labelContent = renderLabel
    ? renderLabel({ isRedirecting: redirecting })
    : redirecting
    ? "Redirecting..."
    : label;

  const combinedClassName = ["discord-connect-button", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={combinedClassName}
      onClick={handleClick}
      disabled={redirecting || disabled}
      {...rest}
    >
      <span className="discord-link-modal__icon" aria-hidden="true">
        <FontAwesomeIcon icon={faDiscord} />
      </span>
      <span className="discord-connect-button__label">{labelContent}</span>
    </button>
  );
}
