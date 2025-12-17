import * as React from "react"
import { Highlight, themes } from "prism-react-renderer"
import {  cva } from "class-variance-authority"
import type {VariantProps} from "class-variance-authority";

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "bg-card text-card-foreground flex flex-col gap-6 rounded-xl py-6 shadow-sm",
  {
    variants: {
      variant: {
        default: "",
        dark:
          "bg-black/40 border border-[#EEFAF2]/20 rounded-[22px] p-8 backdrop-blur-[354px] text-[var(--text-primary)]",
        roadmap:
          "bg-[var(--brand-off-white)]/10 border border-[#EEFAF2]/20 rounded-[22px] p-8 backdrop-blur-[354px] text-[var(--text-primary)]",
        outline:
          "rounded-[22px] p-8 border",
        code:
          "bg-[#1F1F1F] rounded-[4px] px-0 py-0 shadow-[0_0_8px_0_#52C97D40] gap-[10px] w-full overflow-hidden",
        darkSolid:
          "bg-black/55 rounded-[22px] p-8 gap-8 border-0 text-[var(--text-primary)]",
        darkSolidGrey:
          "bg-[var(--wallet-card-grey)] rounded-[22px] p-8 gap-8 border-0 text-[var(--text-primary)]",
        lightSolidGrey:
          "bg-[#232222] rounded-[22px] p-8 gap-8 border-0 text-[var(--text-primary)]",
        ghost:
          "bg-transparent text-inherit border-0 shadow-none rounded-none p-0 gap-0 text-[var(--text-primary)]",
        info:
          "bg-[#DFD59721] rounded-[22px] py-4 gap-3 backdrop-blur-[354px] text-[var(--text-primary)]",
        subtleGreen:
          "bg-[var(--brand-light-dark-green)] border border-[#EEFAF21A] rounded-[22px] py-6 gap-3 text-[var(--text-primary)]",
      },
      tone: {
        green: "",
        blue: "",
      },
    },
    compoundVariants: [
      {
        variant: "outline",
        tone: "green",
        className:
          "bg-[var(--brand-dark-green)] border-[var(--brand-light-green)] shadow-[0_0_8px_0_#52C97D40]",
      },
      {
        variant: "outline",
        tone: "blue",
        className:
          "bg-[var(--brand-dark-blue)] border-[var(--brand-light-blue)] shadow-[0_0_8px_0_#4E64E440]",
      },
    ],
    defaultVariants: {
      variant: "default",
    },
  }
)

const CardVariantContext = React.createContext<string | undefined>(undefined)

function Card({ className, variant, tone, children, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <CardVariantContext.Provider value={variant as string | undefined}>
      <div
        data-slot="card"
        className={cn(cardVariants({ variant, tone, className }))}
        {...props}
      >
        {children}
      </div>
    </CardVariantContext.Provider>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[var(--text-tertiary)] text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, children, ...props }: React.ComponentProps<"div">) {
  const parentVariant = React.useContext(CardVariantContext)
  const shouldRenderHighlight = parentVariant === "code" && !Array.isArray(children) && typeof children === "string"

  if (shouldRenderHighlight) {
    const code = children
    return (
      <div data-slot="card-content" className={cn("text-[var(--text-primary)]", className)} {...props}>
        <Highlight theme={themes.vsDark} code={code} language="tsx">
          {({ className: preClass, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={`${preClass} font-body font-normal text-[14px] leading-[150%] bg-transparent whitespace-pre-wrap break-words w-full px-6 py-4`} style={{ ...style, background: "transparent", margin: 0 }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    )
  }

  return (
    <div
      data-slot="card-content"
      className={cn("px-6  text-[var(--text-primary)]", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}
