import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 [&_[data-loading-spinner]]:text-primary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /// Shows a spinner and disables the button. For work the button can't see
  /// for itself, like a form's submit, where the promise belongs to the form.
  loading?: boolean
}

/// Pending work shorter than this never shows a spinner, so a quick action
/// doesn't flash one.
const SPINNER_DELAY_MS = 150

/// Does the caller already draw its own spinner? Checked one level into the
/// children, which is where every existing call site puts it, so the button
/// doesn't add a second one next to it.
function hasOwnSpinner(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) return false
    const type = child.type as any
    const name = typeof type === "function" || typeof type === "object" ? type?.displayName || type?.name || "" : ""
    if (/LoadingSpinner|Loader2|Spinner/.test(name)) return true
    const className = String((child.props as any)?.className ?? "")
    return className.includes("animate-spin")
  })
}

/// The button's text, flattened, for spotting "Saving…" style labels.
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement(node)) return textOf((node.props as any)?.children)
  return ""
}

/// "Saving…", "Sending...", "Uploading…": a disabled button already telling
/// you it is working, which is the most common way this site marks a save in
/// progress. It gets the spinner to match.
const WORKING_LABEL = /(…|\.\.\.)\s*$/

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, onClick, disabled, children, ...props }, ref) => {
    // A click handler that returns a promise is doing work the button can wait
    // on. That covers `onClick={save}` and `onClick={() => save()}` across the
    // whole site without each one tracking its own saving state.
    const [pending, setPending] = React.useState(false)
    const [showSpinner, setShowSpinner] = React.useState(false)
    const mounted = React.useRef(true)
    React.useEffect(() => {
      // Set on every mount, not just the first: development mounts twice.
      mounted.current = true
      return () => {
        mounted.current = false
      }
    }, [])

    // Disabled with a "…" label is a save in progress drawn the old way; it
    // gets a spinner but isn't otherwise treated differently.
    const labelSaysWorking = Boolean(disabled) && WORKING_LABEL.test(textOf(children).trim())
    const busy = Boolean(loading) || pending || labelSaysWorking
    React.useEffect(() => {
      if (!busy) {
        setShowSpinner(false)
        return
      }
      if (loading || labelSaysWorking) {
        setShowSpinner(true)
        return
      }
      const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS)
      return () => clearTimeout(timer)
    }, [busy, loading, labelSaysWorking])

    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!onClick) return
        const result = onClick(event) as unknown
        if (result && typeof (result as Promise<unknown>).then === "function") {
          setPending(true)
          ;(result as Promise<unknown>)
            .catch(() => undefined)
            .finally(() => {
              if (mounted.current) setPending(false)
            })
        }
      },
      [onClick]
    )

    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          onClick={onClick}
          {...({ disabled } as React.HTMLAttributes<HTMLElement>)}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    const drawSpinner = showSpinner && !hasOwnSpinner(children)
    const isIconOnly = size === "icon"

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={onClick ? handleClick : undefined}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...props}
      >
        {drawSpinner ? (
          isIconOnly ? (
            // An icon button has no room for both: the spinner stands in for
            // the icon while it works.
            <Loader2 className="animate-spin motion-reduce:[animation-duration:2s]" aria-hidden="true" />
          ) : (
            <>
              <Loader2 className="animate-spin motion-reduce:[animation-duration:2s]" aria-hidden="true" />
              {/* The button's own leading icon steps aside for the spinner
                  rather than sitting next to it. */}
              <span className="contents [&>svg:first-child]:hidden">{children}</span>
            </>
          )
        ) : (
          children
        )}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
