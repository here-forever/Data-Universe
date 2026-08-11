import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Check, RefreshCw, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { useI18n } from "../../i18n";
import { vibeApi } from "../../lib/vibeApi";

export function UploadDialog({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (id: string) => Promise<void>;
}) {
  const { formatNumber, t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: () => vibeApi.uploadDataset(file!, name.trim() || undefined),
    onSuccess: (dataset) => onUploaded(dataset.id),
  });
  const chooseFile = (next: File | null) => {
    if (!next) return;
    const extension = next.name.split(".").pop()?.toLowerCase();
    if (
      !extension ||
      !["csv", "xlsx", "xls", "xlsm", "json", "txt"].includes(extension)
    ) {
      return;
    }
    setFile(next);
    setName(next.name.replace(/\.[^.]+$/, ""));
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        aria-labelledby="upload-title"
        aria-modal="true"
        className="upload-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{t("data.localFile")}</span>
            <h2 id="upload-title">{t("data.uploadTitle")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            title={t("common.close")}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <button
          className={`file-dropzone${dragging ? " is-dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            chooseFile(event.dataTransfer.files[0] ?? null);
          }}
          type="button"
        >
          <input
            accept=".csv,.xlsx,.xls,.xlsm,.json,.txt"
            hidden
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            ref={inputRef}
            type="file"
          />
          {file ? (
            <>
              <Check size={28} />
              <strong>{file.name}</strong>
              <span>
                {t("data.changeFile", {
                  size: formatNumber(file.size / 1024, {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: 1,
                  }),
                })}
              </span>
            </>
          ) : (
            <>
              <Upload size={30} />
              <strong>{t("data.dropFile")}</strong>
              <span>{t("data.fileSupport")}</span>
            </>
          )}
        </button>
        <label className="field-label">
          <span>{t("data.datasetName")}</span>
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder={t("data.datasetNamePlaceholder")}
            value={name}
          />
        </label>
        {upload.isError && (
          <p className="form-error">
            <AlertTriangle size={15} />
            {upload.error.message}
          </p>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            {t("common.cancel")}
          </button>
          <button
            className="command-button"
            disabled={!file || upload.isPending}
            onClick={() => upload.mutate()}
            type="button"
          >
            {upload.isPending ? (
              <RefreshCw className="spin" size={16} />
            ) : (
              <Upload size={16} />
            )}
            {upload.isPending ? t("data.parsing") : t("data.startImport")}
          </button>
        </div>
      </div>
    </div>
  );
}
