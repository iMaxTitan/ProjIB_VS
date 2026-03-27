import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/shared/utils"
import type { LucideIcon } from "lucide-react"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "border-transparent bg-green-100 text-green-800",
        warning: "border-transparent bg-yellow-100 text-yellow-800",
        info: "border-transparent bg-blue-100 text-blue-800",
        emerald: "border-transparent bg-emerald-100 text-emerald-700",
        amber: "border-transparent bg-amber-100 text-amber-700",
        red: "border-transparent bg-red-100 text-red-700",
        indigo: "border-transparent bg-indigo-100 text-indigo-700",
        cyan: "border-transparent bg-cyan-100 text-cyan-700",
        blue: "border-transparent bg-blue-100 text-blue-700",
        slate: "border-transparent bg-slate-100 text-slate-700",
        purple: "border-transparent bg-purple-100 text-purple-700",
        violet: "border-transparent bg-violet-100 text-violet-700",
        orange: "border-transparent bg-orange-100 text-orange-800",
        sky: "border-transparent bg-sky-100 text-sky-600",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px]",
        default: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-0.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  icon?: LucideIcon;
}

function Badge({ className, variant, size, icon: Icon, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), Icon && "gap-1", className)} {...props}>
      {Icon && <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
