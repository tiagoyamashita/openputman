import { useState } from "react";
import { proxyRequest } from "./api";
import { parseOpenApiDocument } from "./openapi";
import type { Collection } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: (collection: Collection) => void;
};

type Tab = "paste" | "file" | "url";

export default function ImportOpenApiModal({ open, onClose, onImport }: Props) {
  const [tab, setTab] = useState<Tab>("paste");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function importFromText(raw: string) {
    const collection = parseOpenApiDocument(raw);
    onImport(collection);
    setText("");
    setUrl("");
    setError(null);
    onClose();
  }

  async function handleImport() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "url") {
        if (!url.trim()) throw new Error("Enter an OpenAPI URL");
        const res = await proxyRequest({
          method: "GET",
          url: url.trim(),
          headers: { Accept: "application/json, application/yaml, text/yaml, */*" },
          body: null,
        });
        if (res.status >= 400) {
          throw new Error(`Failed to fetch spec (${res.status} ${res.statusText})`);
        }
        await importFromText(res.body);
      } else {
        if (!text.trim()) throw new Error("Paste an OpenAPI JSON or YAML document");
        await importFromText(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await file.text();
      await importFromText(raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="openapi-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="openapi-import-title">Import OpenAPI</h2>
          <button className="btn" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted modal-lead">
          Paste a spec, upload a file, or load a URL. Endpoints become requests in a new
          collection.
        </p>
        <div className="tabs">
          <button
            type="button"
            className={`tab${tab === "paste" ? " active" : ""}`}
            onClick={() => setTab("paste")}
          >
            Paste
          </button>
          <button
            type="button"
            className={`tab${tab === "file" ? " active" : ""}`}
            onClick={() => setTab("file")}
          >
            File
          </button>
          <button
            type="button"
            className={`tab${tab === "url" ? " active" : ""}`}
            onClick={() => setTab("url")}
          >
            URL
          </button>
        </div>
        <div className="modal-body">
          {tab === "paste" ? (
            <textarea
              className="openapi-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='Paste OpenAPI 3 or Swagger 2 JSON/YAML…'
            />
          ) : null}
          {tab === "file" ? (
            <input
              type="file"
              accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
          ) : null}
          {tab === "url" ? (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
            />
          ) : null}
          {error ? <div className="error-banner">{error}</div> : null}
        </div>
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {tab !== "file" ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void handleImport()}
              disabled={busy}
            >
              {busy ? "Importing…" : "Import endpoints"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
