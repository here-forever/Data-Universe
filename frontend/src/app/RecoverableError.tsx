import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";

import { useI18n } from "../i18n";

interface RecoverableErrorProps {
  className?: string;
  isRetrying?: boolean;
  message: string;
  onRetry: () => void;
  title?: string;
}

export function RecoverableError({
  className = "",
  isRetrying = false,
  message,
  onRetry,
  title,
}: RecoverableErrorProps) {
  const { t } = useI18n();

  return (
    <div
      className={`surface-error recoverable-error ${className}`.trim()}
      role="alert"
    >
      <AlertTriangle aria-hidden="true" size={24} />
      <div className="recoverable-error-copy">
        <strong>{title ?? t("common.requestFailed")}</strong>
        <span>{message}</span>
      </div>
      <button
        className="secondary-button"
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
      >
        {isRetrying ? (
          <LoaderCircle className="spin" size={14} />
        ) : (
          <RefreshCw size={14} />
        )}
        {isRetrying ? t("common.retrying") : t("common.retry")}
      </button>
    </div>
  );
}
