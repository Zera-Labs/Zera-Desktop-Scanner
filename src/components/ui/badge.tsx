import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import {  cva } from "class-variance-authority"
import type {VariantProps} from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[8px] border px-[6px] py-[4px] text-sm leading-[1.25] font-medium w-fit whitespace-nowrap shrink-0 min-h-[20px] gap-1.5 [&>svg]:size-3 [&>svg]:pointer-events-none transition-[color,background-color,border-color,box-shadow] focus-visible:outline-none overflow-hidden",
  {
    variants: {
      variant: {
        // Primary (filled green)
        default:
          "border-transparent bg-[var(--brand-green)] text-[var(--primary-foreground)] focus-visible:ring-[3px] focus-visible:ring-[var(--brand-light-green)]",
        // Secondary (neutral/subtle)
        secondary:
          "border-none bg-[var(--brand-light-dark-green)] text-[var(--brand-green-50)] focus-visible:ring-[3px] focus-visible:ring-[var(--brand-light-green)]",
        // Destructive (filled red)
        destructive:
          "border-transparent bg-destructive text-white focus-visible:ring-[3px] focus-visible:ring-red-500/40",
        // Outline (transparent with border and green text)
        outline:
          "bg-[var(--brand-green-900)] border-[var(--brand-green-300)] text-[var(--brand-green)] focus-visible:ring-[3px] focus-visible:ring-[var(--brand-light-green)]",
        // Ghost (text only)
        ghost:
          "border-transparent bg-transparent text-foreground focus-visible:ring-[3px] focus-visible:ring-[var(--brand-light-green)]",
        // Balance badge; tone applied via compound variants
        balance: "border-transparent",
        // Circular icon-only badge
        icon:
          "px-0 py-0 size-9 rounded-full border-none bg-white/10 text-[var(--brand-green-50)] flex items-center justify-center [&>svg]:size-6",
        // Transaction status badge
        tx:
          "border-none bg-white/5 text-[var(--text-primary)] px-2 py-1 rounded-[8px] gap-1.5 [&>svg]:size-3.5",
      },
      tone: {
        green: null,
        red: null,
      },
      status: {
        pending: null,
        confirmed: null,
        failed: null,
        broadcasted: null,
        execution_reverted: null,
        replaced: null,
        finalized: null,
        provider_error: null,
      },
    },
    compoundVariants: [
      {
        variant: "balance",
        tone: "green",
        class:
          "bg-[var(--brand-dark-green)] text-[var(--brand-green)] focus-visible:ring-[3px] focus-visible:ring-[var(--brand-light-green)]",
      },
      {
        variant: "balance",
        tone: "red",
        class:
          "bg-[rgba(62,34,34,0.5)] text-[#ff8d8d] focus-visible:ring-[3px] focus-visible:ring-red-500/40",
      },
      // Transaction status colorways
      { variant: "tx", status: "pending", class: "bg-[#4a3d00] text-[#ffd860] ring-0" },
      { variant: "tx", status: "confirmed", class: "bg-[rgba(30,66,46,0.6)] text-[#7CFFAA] ring-0" },
      { variant: "tx", status: "failed", class: "bg-[rgba(62,34,34,0.6)] text-[#ff8d8d] ring-0" },
      { variant: "tx", status: "broadcasted", class: "bg-[rgba(30,41,59,0.6)] text-[#93C5FD] ring-0" },
      { variant: "tx", status: "execution_reverted", class: "bg-[rgba(88,28,28,0.6)] text-[#FCA5A5] ring-0" },
      { variant: "tx", status: "replaced", class: "bg-[rgba(30,27,75,0.6)] text-[#C4B5FD] ring-0" },
      { variant: "tx", status: "finalized", class: "bg-[rgba(20,83,45,0.6)] text-[#86EFAC] ring-0" },
      { variant: "tx", status: "provider_error", class: "bg-[rgba(67,20,20,0.6)] text-[#FCA5A5] ring-0" },
    ],
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  balanceTone,
  status,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; balanceTone?: "green" | "red" }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, tone: balanceTone, status }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
