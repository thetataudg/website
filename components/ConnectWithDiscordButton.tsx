"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Discord's mark, inline rather than through Font Awesome. */
function DiscordGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-4", className)}
    >
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.164.29-.355.68-.487.99a18.4 18.4 0 0 0-4.14 0A12.6 12.6 0 0 0 11.436 3a19.7 19.7 0 0 0-3.76 1.372C3.68 9.657 2.87 14.81 3.29 19.89a19.9 19.9 0 0 0 5.993 2.98c.48-.653.91-1.35 1.28-2.08a12.9 12.9 0 0 1-2.01-.96c.17-.124.335-.253.494-.386a14.2 14.2 0 0 0 12.02 0c.16.135.325.264.494.386-.64.375-1.315.697-2.014.962.37.728.797 1.425 1.28 2.078a19.8 19.8 0 0 0 5.996-2.98c.5-5.89-.838-10.995-3.51-15.522ZM9.86 16.79c-1.17 0-2.132-1.074-2.132-2.394 0-1.32.944-2.397 2.132-2.397 1.196 0 2.15 1.086 2.13 2.397 0 1.32-.943 2.394-2.13 2.394Zm7.87 0c-1.17 0-2.132-1.074-2.132-2.394 0-1.32.944-2.397 2.132-2.397 1.195 0 2.148 1.086 2.13 2.397 0 1.32-.935 2.394-2.13 2.394Z" />
    </svg>
  );
}

export interface ConnectWithDiscordButtonProps
  extends Omit<ButtonProps, "onClick"> {
  redirectTo?: string;
  label?: string;
  renderLabel?: (state: { isRedirecting: boolean }) => React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /**
   * Draws the button in Discord's blurple. On by default: people look for the
   * brand colour when they are being asked to connect an account. Pass `false`
   * (or any `variant`) for a button that reads as part of the page instead.
   */
  brand?: boolean;
}

/**
 * Sends the member off to link their Discord account.
 *
 * A shadcn `Button` like every other button on the site — it used to be a
 * hand-rolled full-width pill with a 30px blurple glow under it, which is the
 * loudest thing on any page it appears on and matched nothing around it. The
 * brand colour is kept because it is doing a job here; the pill, the glow and
 * the forced full width are not.
 */
export default function ConnectWithDiscordButton({
  redirectTo,
  label = "Connect with Discord",
  renderLabel,
  className,
  onClick,
  disabled,
  brand = true,
  variant,
  ...rest
}: ConnectWithDiscordButtonProps) {
  const [redirecting, setRedirecting] = React.useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const targetUrl = React.useMemo(() => {
    if (redirectTo) return redirectTo;
    const path = pathname || "/member";
    const query = searchParams?.toString();
    return `${path}${query ? `?${query}` : ""}` || "/member";
  }, [pathname, searchParams, redirectTo]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
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
    ? "Redirecting…"
    : label;

  const wearsBrand = brand && !variant;

  return (
    <Button
      type="button"
      variant={variant}
      onClick={handleClick}
      disabled={redirecting || disabled}
      className={cn(
        wearsBrand &&
          "bg-[#5865F2] text-white hover:bg-[#4752C4] focus-visible:ring-[#5865F2]",
        className
      )}
      {...rest}
    >
      {redirecting ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <DiscordGlyph />
      )}
      {labelContent}
    </Button>
  );
}
