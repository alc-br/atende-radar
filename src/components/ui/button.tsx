import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--raio-sm)] text-[13.5px] font-semibold transition-all active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "text-white border border-transparent bg-[linear-gradient(180deg,#11744a,#0b5a38)] shadow-[0_6px_14px_-8px_rgba(11,90,56,.8),inset_0_1px_0_rgba(255,255,255,.12)] hover:bg-[linear-gradient(180deg,#13814f,#0c623d)]",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-[var(--borda-forte)] bg-[var(--superficie)] text-[var(--texto)] hover:bg-[var(--superficie-2)]",
        secondary:
          "border border-[var(--verde-300)] bg-[var(--verde-50)] text-[var(--verde-700)] hover:bg-[var(--verde-100)]",
        ghost:
          "hover:bg-[var(--superficie-3)] text-[var(--texto-2)] hover:text-[var(--texto)]",
        link: "text-[var(--verde-700)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[38px] px-3.5 py-2",
        sm: "h-8 gap-1.5 px-[11px] text-[12.5px]",
        lg: "h-11 px-[18px] text-[14.5px]",
        icon: "size-[38px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
