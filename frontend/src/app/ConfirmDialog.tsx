import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  error?: string;
  eyebrow: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  pendingLabel: string;
  title: string;
}

export function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  error,
  eyebrow,
  isPending = false,
  onCancel,
  onConfirm,
  pendingLabel,
  title,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelHandlerRef = useRef(onCancel);
  const pendingRef = useRef(isPending);

  useEffect(() => {
    cancelHandlerRef.current = onCancel;
    pendingRef.current = isPending;
  }, [isPending, onCancel]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) {
        cancelHandlerRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      );
      if (!focusable?.length) return;

      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onCancel();
      }}
    >
      <section
        aria-busy={isPending}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog"
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="confirm-dialog-heading">
          <span className="confirm-dialog-icon" aria-hidden="true">
            <AlertTriangle size={21} />
          </span>
          <div className="confirm-dialog-copy">
            <span className="eyebrow">{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            <AlertTriangle size={15} />
            {error}
          </p>
        ) : null}
        <div className="confirm-dialog-actions">
          <button
            className="secondary-button"
            disabled={isPending}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="danger-button"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Trash2 size={16} />
            )}
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
