import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "wide" for forms with tables (returns, transfers, variant grids). */
  size?: "default" | "wide";
}

export function Modal({ open, onClose, children, size = "default" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === "wide" ? "modal-wide" : ""}`}>{children}</div>
    </div>,
    document.body,
  );
}
