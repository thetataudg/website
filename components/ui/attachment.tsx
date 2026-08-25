import * as React from "react";

import { cn } from "@/lib/utils";

const Attachment = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
));
Attachment.displayName = "Attachment";

const AttachmentMedia = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5",
      className
    )}
    {...props}
  />
));
AttachmentMedia.displayName = "AttachmentMedia";

const AttachmentContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("min-w-0 flex-1 space-y-0.5", className)}
    {...props}
  />
));
AttachmentContent.displayName = "AttachmentContent";

const AttachmentTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("truncate text-sm font-medium text-foreground", className)}
    {...props}
  />
));
AttachmentTitle.displayName = "AttachmentTitle";

const AttachmentDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("truncate text-xs text-muted-foreground", className)}
    {...props}
  />
));
AttachmentDescription.displayName = "AttachmentDescription";

const AttachmentActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex shrink-0 items-center gap-1", className)}
    {...props}
  />
));
AttachmentActions.displayName = "AttachmentActions";

export {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
};
