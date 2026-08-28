import React from "react";
import { BookOpen } from "lucide-react";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  icon = <BookOpen className="w-8 h-8 text-vermillion" />,
}) => {
  return (
    <div className="bg-white border border-rule rounded-lg p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-8">
      <div className="p-3 bg-paper-secondary rounded-full mb-4">{icon}</div>
      <h3 className="font-serif text-2xl font-semibold text-charcoal mb-2">{title}</h3>
      <p className="text-charcoal-muted text-sm leading-relaxed mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
