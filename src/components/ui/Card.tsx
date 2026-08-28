import React from "react";
import { clsx } from "clsx";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={clsx("bg-white border border-rule rounded-lg p-6 shadow-sm transition-all hover:border-charcoal-muted/30", className)}
      {...props}
    >
      {children}
    </div>
  );
};
