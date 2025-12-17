import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import {  cva } from "class-variance-authority"
import type {VariantProps} from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[var(--brand-green)] text-[var(--text-secondary)] hover:bg-brand-green/90 w-[157px] h-11 px-4 py-2 shadow-[0_0_8px_0_rgba(82,201,125,0.25)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-[var(--brand-light-green)] bg-[var(--brand-green-500)]/10 text-[var(--text-primary)] shadow-[0_0_8px_0_rgba(82,201,125,0.25)] hover:bg-[#52C97D33] hover:text-[var(--brand-green)] w-[130px] h-11 px-4 py-2 gap-[10px]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        icon: "size-[44px] rounded-full border border-input/40 bg-white/10 hover:bg-white/20 [&_svg:not([class*='size-'])]:size-6 border-none",
        greenTint:
          "bg-[var(--brand-green-200)]/10 text-[var(--text-primary)] w-[112px] h-10 px-4 py-2",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
          "icon-44": "size-[44px] p-0",
      },
      pill: {
        true: "rounded-[22px]",
        false: "rounded-[18px]",
      },
      expand: {
        true: "w-auto",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      pill: false,
      expand: false,
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  pill,
  expand,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className, pill, expand }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
