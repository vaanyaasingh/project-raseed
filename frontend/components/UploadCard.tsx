"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";

interface UploadCardProps {
  title: string;
  description: string;
  accept: string;           // e.g. ".pdf" or ".csv"
  acceptLabel: string;      // e.g. "PDF up to 10 MB" or "CSV file"
  icon: React.ReactNode;
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadCard({
  title,
  description,
  accept,
  acceptLabel,
  icon,
  onFileSelect,
  disabled = false,
}: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleFile(file: File) {
    setSelectedFile(file);
    onFileSelect(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        background: dragOver ? "var(--primary-50)" : "var(--surface)",
        border: `2px dashed ${dragOver ? "var(--primary)" : selectedFile ? "var(--success)" : "var(--border)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "border-color 150ms var(--ease), background 150ms var(--ease)",
        opacity: disabled ? 0.5 : 1,
        userSelect: "none",
        textAlign: "center",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onChange}
        style={{ display: "none" }}
        disabled={disabled}
      />

      {/* Icon */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "var(--radius-lg)",
          background: selectedFile ? "var(--success-50)" : dragOver ? "var(--primary-50)" : "var(--bg-2)",
          color: selectedFile ? "var(--success)" : dragOver ? "var(--primary)" : "var(--ink-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 150ms var(--ease), color 150ms var(--ease)",
        }}
      >
        {icon}
      </div>

      {/* Text */}
      {selectedFile ? (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>
            {selectedFile.name}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>
            {formatBytes(selectedFile.size)} · Click to change
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>{title}</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>{description}</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              marginTop: 8,
              padding: "3px 10px",
              background: "var(--bg-2)",
              borderRadius: 999,
              display: "inline-block",
            }}
          >
            {acceptLabel}
          </div>
        </div>
      )}
    </div>
  );
}
