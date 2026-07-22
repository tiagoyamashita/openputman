import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMe,
  loadWorkspace,
  logout as apiLogout,
  proxyRequest,
  saveWorkspace,
} from "./api";
import ImportOpenApiModal from "./ImportOpenApiModal";
import {
  applyExportToWorkspace,
  buildExport,
  downloadExport,
  parseOpenputmanExport,
} from "./exportFormat";
import { loadLocalWorkspace, saveLocalWorkspace } from "./storage";
import {
  emptyCollection,
  emptyGroup,
  emptyRequest,
  normalizeWorkspace,
  type ApiRequest,
  type BodyType,
  type Collection,
  type HeaderRow,
  type ProxyResponse,
  type User,
  type WebsiteGroup,
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
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);

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
          const ws = normalizeWorkspace(loaded.workspace) ?? loaded.workspace;
          setWorkspace(ws);
          setGistId(loaded.gistId);
          const sel = selectFirst(ws);
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

  function addGroup() {
    if (!workspace) return;
    const name = window.prompt("Website / group name", "New website");
    if (!name?.trim()) return;
    const website = window.prompt("Website URL (optional)", "https://") ?? "";
    const group = emptyGroup(name.trim(), website.trim());
    setWorkspace({ ...workspace, groups: [...workspace.groups, group] });
    setActiveGroupId(group.id);
    setDirty(true);
  }

  function addCollection(groupId: string | null = activeGroupId) {
    if (!workspace) return;
    const collection = emptyCollection(
      `Collection ${workspace.collections.length + 1}`,
      groupId,
    );
    setWorkspace({ ...workspace, collections: [...workspace.collections, collection] });
    setCollectionId(collection.id);
    setRequestId(collection.requests[0].id);
    setActiveGroupId(groupId);
    setDirty(true);
  }

  function moveCollectionToGroup(targetCollectionId: string, groupId: string | null) {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      collections: workspace.collections.map((collection) =>
        collection.id === targetCollectionId ? { ...collection, groupId } : collection,
      ),
    });
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
    const next = { ...collection, groupId: activeGroupId };
    setWorkspace({
      ...workspace,
      collections: [...workspace.collections, next],
    });
    setCollectionId(next.id);
    setRequestId(next.requests[0]?.id ?? null);
    setDirty(true);
    setError(null);
  }

  function handleExportAll() {
    if (!workspace) return;
    try {
      downloadExport(buildExport("workspace", workspace, collectionId, requestId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  function handleExportRequest() {
    if (!workspace) return;
    try {
      downloadExport(buildExport("request", workspace, collectionId, requestId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function handleLoadFile(file: File | null) {
    if (!file || !workspace) return;
    try {
      const raw = await file.text();
      const payload = parseOpenputmanExport(raw);
      const next = applyExportToWorkspace(workspace, payload, collectionId);
      setWorkspace(next.workspace);
      setCollectionId(next.collectionId);
      setRequestId(next.requestId);
      setDirty(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      if (loadInputRef.current) loadInputRef.current.value = "";
    }
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
        <p className="muted">Loading OpenPutMan…</p>
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
            <h1>OpenPutMan</h1>
            <span>
              {user
                ? "Collections sync to your GitHub Gist"
                : "Collections save in this browser (local storage)"}
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn" type="button" onClick={handleExportAll}>
            Export all
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => loadInputRef.current?.click()}
          >
            Load
          </button>
          <input
            ref={loadInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void handleLoadFile(e.target.files?.[0] ?? null)}
          />
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
            <a className="btn btn-github" href="/auth/github">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                />
              </svg>
              Sign in with GitHub
            </a>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Websites</h2>
            <div className="sidebar-actions">
              <button className="btn" title="Import OpenAPI" onClick={() => setImportOpen(true)}>
                OpenAPI
              </button>
              <button className="btn" title="New website group" onClick={addGroup}>
                + site
              </button>
            </div>
          </div>
          <div className="sidebar-body">
            {workspace.groups.map((group) => (
              <WebsiteGroupBlock
                key={group.id}
                group={group}
                collections={workspace.collections.filter((c) => c.groupId === group.id)}
                allGroups={workspace.groups}
                activeRequestId={selection.requestId}
                onAddCollection={() => addCollection(group.id)}
                onAddRequest={addRequest}
                onSelectRequest={(cid, rid) => {
                  setActiveGroupId(group.id);
                  setCollectionId(cid);
                  setRequestId(rid);
                  setResponse(null);
                }}
                onMoveCollection={moveCollectionToGroup}
              />
            ))}
            <WebsiteGroupBlock
              group={null}
              collections={workspace.collections.filter(
                (c) => !c.groupId || !workspace.groups.some((g) => g.id === c.groupId),
              )}
              allGroups={workspace.groups}
              activeRequestId={selection.requestId}
              onAddCollection={() => addCollection(null)}
              onAddRequest={addRequest}
              onSelectRequest={(cid, rid) => {
                setActiveGroupId(null);
                setCollectionId(cid);
                setRequestId(rid);
                setResponse(null);
              }}
              onMoveCollection={moveCollectionToGroup}
            />
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
            <button className="btn" type="button" onClick={handleExportRequest}>
              Export request
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

type GroupBlockProps = {
  group: WebsiteGroup | null;
  collections: Collection[];
  allGroups: WebsiteGroup[];
  activeRequestId: string;
  onAddCollection: () => void;
  onAddRequest: (collectionId: string) => void;
  onSelectRequest: (collectionId: string, requestId: string) => void;
  onMoveCollection: (collectionId: string, groupId: string | null) => void;
};

function WebsiteGroupBlock({
  group,
  collections,
  allGroups,
  activeRequestId,
  onAddCollection,
  onAddRequest,
  onSelectRequest,
  onMoveCollection,
}: GroupBlockProps) {
  const containsActive = collections.some((collection) =>
    collection.requests.some((request) => request.id === activeRequestId),
  );
  const [open, setOpen] = useState(containsActive);
  const requestCount = collections.reduce((sum, collection) => sum + collection.requests.length, 0);

  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  if (!group && collections.length === 0) return null;

  const label = group ? group.name : "Ungrouped";

  return (
    <div className={`website-group${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="website-group-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="website-group-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="website-group-title">
          <strong>{label}</strong>
          {group?.website ? <span className="website-url">{group.website}</span> : null}
          <span className="website-meta">
            {collections.length} collection{collections.length === 1 ? "" : "s"} · {requestCount}{" "}
            request{requestCount === 1 ? "" : "s"}
          </span>
        </span>
      </button>
      {open ? (
        <div className="website-group-body">
          <div className="website-group-toolbar">
            <button className="linkish" type="button" onClick={onAddCollection}>
              + collection
            </button>
          </div>
          {collections.map((collection) => (
            <div className="collection" key={collection.id}>
              <div className="collection-title">
                <span>{collection.name}</span>
                <div className="collection-actions">
                  <select
                    className="group-select"
                    value={collection.groupId ?? ""}
                    title="Move to website group"
                    onChange={(e) =>
                      onMoveCollection(collection.id, e.target.value ? e.target.value : null)
                    }
                  >
                    <option value="">Ungrouped</option>
                    {allGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="linkish"
                    type="button"
                    onClick={() => onAddRequest(collection.id)}
                  >
                    + request
                  </button>
                </div>
              </div>
              {collection.requests.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`request-item${item.id === activeRequestId ? " active" : ""}`}
                  onClick={() => onSelectRequest(collection.id, item.id)}
                >
                  <span className={`method ${item.method}`}>{item.method}</span>
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          ))}
          {collections.length === 0 ? (
            <p className="muted website-empty">No collections in this website yet.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
