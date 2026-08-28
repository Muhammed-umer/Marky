import React from "react";
import { clsx } from "clsx";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "active" | "outline";
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ variant = "default", className, children, ...props }) => {
  const baseStyles = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors";

  const variantStyles = {
    default: "bg-paper-secondary text-charcoal-muted border border-rule",
    active: "bg-vermillion text-white",
    outline: "border border-rule text-charcoal bg-transparent",
  };

  return (
    <span className={clsx(baseStyles, variantStyles[variant], className)} {...props}>
      {children}
    </span>
  );
};
