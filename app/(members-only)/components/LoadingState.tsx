"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

export function LoadingSpinner({
  className = "",
  size = "lg",
}: {
  className?: string;
  size?: "xs" | "sm" | "lg" | "xl" | "2x";
}) {
  return (
    <FontAwesomeIcon
      icon={faSpinner}
      spin
      size={size}
      className={`loading-spinner ${className}`.trim()}
    />
  );
}

export default function LoadingState({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <div className="loading-state">
      <LoadingSpinner size="2x" />
      <div className="loading-state__text">{message}</div>
    </div>
  );
}
