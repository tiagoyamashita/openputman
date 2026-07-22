import { useState } from "react";
import {
  applyExportToWorkspace,
  buildExport,
  downloadExport,
  parseOpenputmanExport,
  type ExportKind,
} from "./exportFormat";
import type { Workspace } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
  collectionId: string | null;
  requestId: string | null;
  onLoaded: (next: {
    workspace: Workspace;
    collectionId: string | null;
    requestId: string | null;
  }) => void;
};

type Mode = "export" | "load";

export default function ExportImportModal({
  open,
  onClose,
  workspace,
  collectionId,
  requestId,
  onLoaded,
}: Props) {
  const [mode, setMode] = useState<Mode>("export");
  const [kind, setKind] = useState<ExportKind>("workspace");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const activeCollection =
    workspace.collections.find((c) => c.id === collectionId) ?? workspace.collections[0];
  const activeRequest =
    activeCollection?.requests.find((r) => r.id === requestId) ??
    activeCollection?.requests[0];

  function handleExport() {
    setError(null);
    try {
      const payload = buildExport(kind, workspace, collectionId, requestId);
      downloadExport(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  function handleLoadRaw(raw: string) {
    setError(null);
    try {
      const payload = parseOpenputmanExport(raw);
      const next = applyExportToWorkspace(workspace, payload, collectionId);
      onLoaded(next);
      setPaste("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    try {
      handleLoadRaw(await file.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="export-import-title">Export / Load</h2>
          <button className="btn" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted modal-lead">
          Export everything, one collection, or a single request — then load the JSON later.
        </p>
        <div className="tabs">
          <button
            type="button"
            className={`tab${mode === "export" ? " active" : ""}`}
            onClick={() => setMode("export")}
          >
            Export
          </button>
          <button
            type="button"
            className={`tab${mode === "load" ? " active" : ""}`}
            onClick={() => setMode("load")}
          >
            Load
          </button>
        </div>
        <div className="modal-body">
          {mode === "export" ? (
            <>
              <label className="choice-row">
                <input
                  type="radio"
                  name="export-kind"
                  checked={kind === "workspace"}
                  onChange={() => setKind("workspace")}
                />
                <span>
                  <strong>All</strong> — full workspace ({workspace.collections.length}{" "}
                  collections)
                </span>
              </label>
              <label className="choice-row">
                <input
                  type="radio"
                  name="export-kind"
                  checked={kind === "collection"}
                  onChange={() => setKind("collection")}
                  disabled={!activeCollection}
                />
                <span>
                  <strong>Collection</strong> — {activeCollection?.name ?? "none selected"}
                </span>
              </label>
              <label className="choice-row">
                <input
                  type="radio"
                  name="export-kind"
                  checked={kind === "request"}
                  onChange={() => setKind("request")}
                  disabled={!activeRequest}
                />
                <span>
                  <strong>One request</strong> — {activeRequest?.method ?? ""}{" "}
                  {activeRequest?.name ?? "none selected"}
                </span>
              </label>
            </>
          ) : (
            <>
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              />
              <textarea
                className="openapi-textarea"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Or paste an Openputman export JSON…"
              />
            </>
          )}
          {error ? <div className="error-banner">{error}</div> : null}
        </div>
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          {mode === "export" ? (
            <button className="btn btn-primary" type="button" onClick={handleExport}>
              Download export
            </button>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => handleLoadRaw(paste)}
              disabled={!paste.trim()}
            >
              Load paste
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
