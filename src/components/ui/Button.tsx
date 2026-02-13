'use client';

import * as React from 'react';
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,background-color] duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-95",
  {
    variants: {
      variant: {
        default: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md",
        destructive: "bg-error-500 text-white hover:bg-error-700 focus-visible:ring-error-500 shadow-sm hover:shadow-md",
        outline: "border-2 border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 text-gray-700",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
        ghost: "hover:bg-gray-100 hover:text-gray-900",
        link: "text-indigo-600 underline-offset-4 hover:underline hover:text-indigo-700",
        success: "bg-success-500 text-white hover:bg-success-700 focus-visible:ring-success-500 shadow-sm hover:shadow-md",
        warning: "bg-warning-500 text-white hover:bg-warning-700 focus-visible:ring-warning-500 shadow-sm hover:shadow-md",
        // Legacy variants for backward compatibility
        primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md",
      },
      size: {
        xs: "h-7 px-2 py-1 text-xs rounded-md",
        sm: "h-9 px-3 py-2 text-sm rounded-md",
        md: "h-10 px-4 py-2.5 text-sm",
        default: "h-10 px-4 py-2.5 text-sm",
        lg: "h-11 px-6 py-3 text-base",
        xl: "h-12 px-8 py-3.5 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants }; 