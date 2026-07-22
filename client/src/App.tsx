import { useEffect, useMemo, useState } from "react";
import {
  fetchMe,
  loadWorkspace,
  logout as apiLogout,
  proxyRequest,
  saveWorkspace,
} from "./api";
import ImportOpenApiModal from "./ImportOpenApiModal";
import { loadLocalWorkspace, saveLocalWorkspace } from "./storage";
import {
  emptyCollection,
  emptyRequest,
  type ApiRequest,
  type BodyType,
  type Collection,
  type HeaderRow,
  type ProxyResponse,
  type User,
  type Workspace,
} from "./types";

type EditorTab = "headers" | "body";
type ResponseTab = "body" | "headers";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

function findSelection(
  workspace: Workspace,
  collectionId: string | null,
  requestId: string | null,
): { collectionId: string; requestId: string; request: ApiRequest } | null {
  const collection =
    workspace.collections.find((c) => c.id === collectionId) ?? workspace.collections[0];
  if (!collection) return null;
  const request =
    collection.requests.find((r) => r.id === requestId) ?? collection.requests[0];
  if (!request) return null;
  return { collectionId: collection.id, requestId: request.id, request };
}

function selectFirst(workspace: Workspace): {
  collectionId: string | null;
  requestId: string | null;
} {
  const first = workspace.collections[0];
  return {
    collectionId: first?.id ?? null,
    requestId: first?.requests[0]?.id ?? null,
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [gistId, setGistId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("headers");
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me);
        if (me) {
          const loaded = await loadWorkspace();
          if (cancelled) return;
          setWorkspace(loaded.workspace);
          setGistId(loaded.gistId);
          const sel = selectFirst(loaded.workspace);
          setCollectionId(sel.collectionId);
          setRequestId(sel.requestId);
        } else {
          const local = loadLocalWorkspace();
          setWorkspace(local);
          setGistId(null);
          const sel = selectFirst(local);
          setCollectionId(sel.collectionId);
          setRequestId(sel.requestId);
        }
      } catch (err) {
        if (!cancelled) {
          const local = loadLocalWorkspace();
          setWorkspace(local);
          const sel = selectFirst(local);
          setCollectionId(sel.collectionId);
          setRequestId(sel.requestId);
          setError(err instanceof Error ? err.message : "Failed to start");
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selection = useMemo(() => {
    if (!workspace) return null;
    return findSelection(workspace, collectionId, requestId);
  }, [workspace, collectionId, requestId]);

  function updateRequest(patch: Partial<ApiRequest>) {
    if (!workspace || !selection) return;
    setWorkspace({
      ...workspace,
      collections: workspace.collections.map((collection) => {
        if (collection.id !== selection.collectionId) return collection;
        return {
          ...collection,
          requests: collection.requests.map((request) =>
            request.id === selection.requestId ? { ...request, ...patch } : request,
          ),
        };
      }),
    });
    setDirty(true);
  }

  function updateHeaders(headers: HeaderRow[]) {
    updateRequest({ headers });
  }

  function addCollection() {
    if (!workspace) return;
    const collection = emptyCollection(`Collection ${workspace.collections.length + 1}`);
    setWorkspace({ ...workspace, collections: [...workspace.collections, collection] });
    setCollectionId(collection.id);
    setRequestId(collection.requests[0].id);
    setDirty(true);
  }

  function addRequest(targetCollectionId: string) {
    if (!workspace) return;
    const request = emptyRequest();
    setWorkspace({
      ...workspace,
      collections: workspace.collections.map((collection) =>
        collection.id === targetCollectionId
          ? { ...collection, requests: [...collection.requests, request] }
          : collection,
      ),
    });
    setCollectionId(targetCollectionId);
    setRequestId(request.id);
    setDirty(true);
  }

  function importCollection(collection: Collection) {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      collections: [...workspace.collections, collection],
    });
    setCollectionId(collection.id);
    setRequestId(collection.requests[0]?.id ?? null);
    setDirty(true);
    setError(null);
  }

  async function handleSave() {
    if (!workspace) return;
    setSaving(true);
    setError(null);
    try {
      if (user) {
        const result = await saveWorkspace(workspace, gistId);
        setGistId(result.gistId);
      } else {
        saveLocalWorkspace(workspace);
      }
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!selection) return;
    setSending(true);
    setError(null);
    setResponse(null);
    try {
      const { request } = selection;
      const headers: Record<string, string> = {};
      for (const row of request.headers) {
        if (!row.enabled || !row.key.trim()) continue;
        headers[row.key] = row.value;
      }
      if (request.bodyType === "json" && request.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      const body =
        request.bodyType === "none" || request.method === "GET" || request.method === "HEAD"
          ? null
          : request.body;
      const result = await proxyRequest({
        method: request.method,
        url: request.url,
        headers,
        body,
      });
      setResponse(result);
      setResponseTab("body");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    if (workspace) {
      saveLocalWorkspace(workspace);
    }
    await apiLogout();
    setUser(null);
    setGistId(null);
    setResponse(null);
    setDirty(false);
    const local = loadLocalWorkspace();
    setWorkspace(local);
    const sel = selectFirst(local);
    setCollectionId(sel.collectionId);
    setRequestId(sel.requestId);
  }

  if (booting) {
    return (
      <div className="landing">
        <p className="muted">Loading Openputman…</p>
      </div>
    );
  }

  if (!workspace || !selection) {
    return (
      <div className="landing">
        <p className="muted">No workspace loaded.</p>
      </div>
    );
  }

  const { request } = selection;
  const saveLabel = user
    ? saving
      ? "Saving…"
      : dirty
        ? "Save to GitHub"
        : "Saved"
    : saving
      ? "Saving…"
      : dirty
        ? "Save locally"
        : "Saved";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="" />
          <div>
            <h1>Openputman</h1>
            <span>
              {user
                ? "Collections sync to your GitHub Gist"
                : "Collections save in this browser (local storage)"}
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !dirty}>
            {saveLabel}
          </button>
          {user ? (
            <>
              <div className="user-chip">
                <img src={user.avatar} alt="" />
                <span>{user.login}</span>
              </div>
              <button className="btn" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <a className="btn" href="/auth/github">
              Sign in with GitHub
            </a>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Collections</h2>
            <div className="sidebar-actions">
              <button className="btn" title="Import OpenAPI" onClick={() => setImportOpen(true)}>
                OpenAPI
              </button>
              <button className="btn" title="New collection" onClick={addCollection}>
                +
              </button>
            </div>
          </div>
          <div className="sidebar-body">
            {workspace.collections.map((collection) => (
              <div className="collection" key={collection.id}>
                <div className="collection-title">
                  <span>{collection.name}</span>
                  <button className="linkish" onClick={() => addRequest(collection.id)}>
                    + request
                  </button>
                </div>
                {collection.requests.map((item) => (
                  <button
                    key={item.id}
                    className={`request-item${
                      item.id === selection.requestId ? " active" : ""
                    }`}
                    onClick={() => {
                      setCollectionId(collection.id);
                      setRequestId(item.id);
                      setResponse(null);
                    }}
                  >
                    <span className={`method ${item.method}`}>{item.method}</span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <section className="main-pane">
          {error ? <div className="error-banner">{error}</div> : null}

          <div className="request-bar">
            <select
              value={request.method}
              onChange={(e) => updateRequest({ method: e.target.value })}
            >
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <input
              value={request.url}
              onChange={(e) => updateRequest({ url: e.target.value })}
              placeholder="https://api.example.com/path"
            />
            <input
              value={request.name}
              onChange={(e) => updateRequest({ name: e.target.value })}
              placeholder="Request name"
              style={{ maxWidth: 180 }}
            />
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>

          <div>
            <div className="tabs">
              <button
                className={`tab${editorTab === "headers" ? " active" : ""}`}
                onClick={() => setEditorTab("headers")}
              >
                Headers
              </button>
              <button
                className={`tab${editorTab === "body" ? " active" : ""}`}
                onClick={() => setEditorTab("body")}
              >
                Body
              </button>
            </div>
            <div className="tabs-panel">
              {editorTab === "headers" ? (
                <>
                  {request.headers.map((row, index) => (
                    <div className="kv" key={`${index}-${row.key}`}>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => {
                          const next = request.headers.map((h, i) =>
                            i === index ? { ...h, enabled: e.target.checked } : h,
                          );
                          updateHeaders(next);
                        }}
                      />
                      <input
                        placeholder="Header"
                        value={row.key}
                        onChange={(e) => {
                          const next = request.headers.map((h, i) =>
                            i === index ? { ...h, key: e.target.value } : h,
                          );
                          updateHeaders(next);
                        }}
                      />
                      <input
                        placeholder="Value"
                        value={row.value}
                        onChange={(e) => {
                          const next = request.headers.map((h, i) =>
                            i === index ? { ...h, value: e.target.value } : h,
                          );
                          updateHeaders(next);
                        }}
                      />
                      <button
                        className="btn"
                        onClick={() =>
                          updateHeaders(request.headers.filter((_, i) => i !== index))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn"
                    onClick={() =>
                      updateHeaders([
                        ...request.headers,
                        { key: "", value: "", enabled: true },
                      ])
                    }
                  >
                    Add header
                  </button>
                </>
              ) : (
                <div className="body-editor">
                  <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
                    {(["none", "json", "raw"] as BodyType[]).map((type) => (
                      <button
                        key={type}
                        className={`btn${request.bodyType === type ? " btn-primary" : ""}`}
                        onClick={() => updateRequest({ bodyType: type })}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  {request.bodyType === "none" ? (
                    <p className="muted">This request has no body.</p>
                  ) : (
                    <textarea
                      value={request.body}
                      onChange={(e) => updateRequest({ body: e.target.value })}
                      placeholder={
                        request.bodyType === "json" ? '{\n  "hello": "world"\n}' : "raw body"
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="response-pane">
            <div className="response-meta">
              {response ? (
                <>
                  <span className={response.status < 400 ? "status-ok" : "status-err"}>
                    {response.status} {response.statusText}
                  </span>
                  <span>{response.timeMs} ms</span>
                  <span>{response.sizeBytes} B</span>
                </>
              ) : (
                <span>Response</span>
              )}
            </div>
            <div className="tabs">
              <button
                className={`tab${responseTab === "body" ? " active" : ""}`}
                onClick={() => setResponseTab("body")}
              >
                Body
              </button>
              <button
                className={`tab${responseTab === "headers" ? " active" : ""}`}
                onClick={() => setResponseTab("headers")}
              >
                Headers
              </button>
            </div>
            <div className="tabs-panel">
              {!response ? (
                <p className="muted">Send a request to see the response.</p>
              ) : responseTab === "body" ? (
                <textarea className="response-body" readOnly value={formatBody(response.body)} />
              ) : (
                <pre className="response-body">
                  {Object.entries(response.headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n")}
                </pre>
              )}
            </div>
          </div>
        </section>
      </div>

      <ImportOpenApiModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={importCollection}
      />
    </div>
  );
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
