import React from "react";
import { clsx } from "clsx";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";

export interface BannerProps {
  type?: "info" | "success" | "error";
  title?: string;
  message: string;
  onClose?: () => void;
}

export const Banner: React.FC<BannerProps> = ({ type = "info", title, message, onClose }) => {
  const styles = {
    info: "bg-paper-secondary border-rule text-charcoal",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    error: "bg-rose-50 border-rose-200 text-rose-900",
  };

  const icons = {
    info: <Info className="w-5 h-5 text-charcoal-muted shrink-0" />,
    success: <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-vermillion shrink-0" />,
  };

  return (
    <div className={clsx("border rounded-md p-4 flex items-start gap-3 my-4", styles[type])}>
      {icons[type]}
      <div className="flex-1 text-sm">
        {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
        <p className="leading-relaxed">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-charcoal-muted hover:text-charcoal p-1 rounded transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
