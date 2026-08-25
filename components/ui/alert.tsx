import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px]",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground [&>svg]:text-foreground",
        destructive:
          "border-destructive/50 bg-destructive/10 text-foreground [&>svg]:text-destructive",
        warning:
          "border-amber-500/50 bg-amber-500/10 text-foreground [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
        success:
          "border-emerald-600/50 bg-emerald-600/10 text-foreground [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400",
        info: "border-primary/40 bg-primary/10 text-foreground [&>svg]:text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    /* `text-sm` is explicit rather than inherited: this is an <h5>, and
     * Tailwind preflight leaves heading sizes to inherit. */
    className={cn(
      "mb-1 text-sm font-medium leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
