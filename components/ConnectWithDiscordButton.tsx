"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Discord's mark, inline rather than through Font Awesome.
 *
 * This is the canonical path, authored for a 24x24 box. The one it replaces
 * was drawn with arc radii that bulged past the right edge of its own viewBox,
 * so the mark rendered wider than the 16px the button reserves for it and sat
 * against the "C" of the label however much gap the button asked for.
 */
function DiscordGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
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
        "gap-2.5",
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
