import * as React from "react"
import {  cva } from "class-variance-authority"
import type {VariantProps} from "class-variance-authority";

import { cn } from "@/lib/utils"

const inputVariants = cva(
  [
    // Base visual styles
    "w-full min-w-0 rounded-md border bg-transparent text-base md:text-sm shadow-xs outline-none",
    "border-input bg-[var(--brand-green-950)]",
    // Text helpers
    "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
    // Transitions
    "transition-[color,box-shadow,border-color,background-color]",
    // Focus (brand green ring)
    "focus-visible:ring-[3px] focus-visible:border-[var(--brand-green-400)] focus-visible:ring-[color:var(--brand-green-300)]/40",
    // Hover
    "hover:border-[var(--brand-green-300)]",
    // Error state (uses complementary pink scale)
    "aria-invalid:border-[var(--cpink-500)] aria-invalid:focus-visible:ring-[color:var(--cpink-500)]/40",
    // Disabled
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    // File input button
    "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
  ].join(" "),
  {
    variants: {
      size: {
        reg: "h-9 px-3 py-1",
        lg: "h-10 px-4 py-2 text-base",
        sm: "h-8 px-2.5 text-sm",
        mini: "h-7 px-2 text-xs",
      },
    },
    defaultVariants: {
      size: "reg",
    },
  }
)

type InputProps = React.ComponentProps<"input"> &
  VariantProps<typeof inputVariants>

function Input({ className, type, size, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
