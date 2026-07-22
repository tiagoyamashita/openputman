import {
  createId,
  emptyCollection,
  type ApiRequest,
  type Collection,
  type Workspace,
} from "./types";

export type ExportKind = "workspace" | "collection" | "request";

export type OpenputmanExport = {
  format: "openputman";
  version: 1;
  kind: ExportKind;
  exportedAt: string;
  workspace?: Workspace;
  collection?: Collection;
  request?: ApiRequest;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHeaderRow(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.value === "string" &&
    typeof value.enabled === "boolean"
  );
}

function isApiRequest(value: unknown): value is ApiRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.method === "string" &&
    typeof value.url === "string" &&
    Array.isArray(value.headers) &&
    value.headers.every(isHeaderRow) &&
    typeof value.body === "string" &&
    (value.bodyType === "none" || value.bodyType === "json" || value.bodyType === "raw")
  );
}

function isCollection(value: unknown): value is Collection {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.requests) &&
    value.requests.every(isApiRequest)
  );
}

function isWorkspace(value: unknown): value is Workspace {
  return (
    isRecord(value) &&
    value.version === 1 &&
    Array.isArray(value.collections) &&
    value.collections.every(isCollection) &&
    Array.isArray(value.environments)
  );
}

export function buildExport(
  kind: ExportKind,
  workspace: Workspace,
  collectionId: string | null,
  requestId: string | null,
): OpenputmanExport {
  const exportedAt = new Date().toISOString();
  if (kind === "workspace") {
    return { format: "openputman", version: 1, kind, exportedAt, workspace };
  }

  const collection =
    workspace.collections.find((c) => c.id === collectionId) ?? workspace.collections[0];
  if (!collection) {
    throw new Error("No collection to export");
  }

  if (kind === "collection") {
    return { format: "openputman", version: 1, kind, exportedAt, collection };
  }

  const request =
    collection.requests.find((r) => r.id === requestId) ?? collection.requests[0];
  if (!request) {
    throw new Error("No request to export");
  }

  return { format: "openputman", version: 1, kind, exportedAt, request };
}

export function parseOpenputmanExport(raw: string): OpenputmanExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Export file must be valid JSON");
  }

  if (!isRecord(parsed) || parsed.format !== "openputman" || parsed.version !== 1) {
    throw new Error('Not an Openputman export (expected format "openputman" version 1)');
  }

  const kind = parsed.kind;
  if (kind !== "workspace" && kind !== "collection" && kind !== "request") {
    throw new Error("Export kind must be workspace, collection, or request");
  }

  if (kind === "workspace") {
    if (!isWorkspace(parsed.workspace)) throw new Error("Invalid workspace in export");
    return {
      format: "openputman",
      version: 1,
      kind,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
      workspace: parsed.workspace,
    };
  }

  if (kind === "collection") {
    if (!isCollection(parsed.collection)) throw new Error("Invalid collection in export");
    return {
      format: "openputman",
      version: 1,
      kind,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
      collection: parsed.collection,
    };
  }

  if (!isApiRequest(parsed.request)) throw new Error("Invalid request in export");
  return {
    format: "openputman",
    version: 1,
    kind,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    request: parsed.request,
  };
}

function remintRequest(request: ApiRequest): ApiRequest {
  return { ...request, id: createId() };
}

function remintCollection(collection: Collection): Collection {
  return {
    ...collection,
    id: createId(),
    requests: collection.requests.map(remintRequest),
  };
}

export type LoadResult = {
  workspace: Workspace;
  collectionId: string | null;
  requestId: string | null;
};

export function applyExportToWorkspace(
  current: Workspace,
  payload: OpenputmanExport,
  activeCollectionId: string | null,
): LoadResult {
  switch (payload.kind) {
    case "workspace": {
      const collections = (payload.workspace?.collections ?? []).map(remintCollection);
      const workspace: Workspace = {
        version: 1,
        environments: payload.workspace?.environments ?? [],
        activeEnvironmentId: payload.workspace?.activeEnvironmentId ?? null,
        collections:
          collections.length > 0 ? collections : current.collections.map(remintCollection),
      };
      const first = workspace.collections[0];
      return {
        workspace,
        collectionId: first?.id ?? null,
        requestId: first?.requests[0]?.id ?? null,
      };
    }
    case "collection": {
      if (!payload.collection) throw new Error("Missing collection in export");
      const collection = remintCollection(payload.collection);
      return {
        workspace: {
          ...current,
          collections: [...current.collections, collection],
        },
        collectionId: collection.id,
        requestId: collection.requests[0]?.id ?? null,
      };
    }
    case "request": {
      if (!payload.request) throw new Error("Missing request in export");
      const request = remintRequest(payload.request);
      const targetId =
        activeCollectionId && current.collections.some((c) => c.id === activeCollectionId)
          ? activeCollectionId
          : current.collections[0]?.id;

      if (!targetId) {
        const collection = emptyCollection("Imported");
        collection.requests = [request];
        return {
          workspace: { ...current, collections: [collection] },
          collectionId: collection.id,
          requestId: request.id,
        };
      }

      return {
        workspace: {
          ...current,
          collections: current.collections.map((collection) =>
            collection.id === targetId
              ? { ...collection, requests: [...collection.requests, request] }
              : collection,
          ),
        },
        collectionId: targetId,
        requestId: request.id,
      };
    }
    default: {
      const _exhaustive: never = payload.kind;
      throw new Error(`Unhandled export kind: ${_exhaustive}`);
    }
  }
}

export function downloadExport(payload: OpenputmanExport): void {
  const stamp = payload.exportedAt.slice(0, 10) || "export";
  const namePart =
    payload.kind === "workspace"
      ? "workspace"
      : payload.kind === "collection"
        ? slug(payload.collection?.name ?? "collection")
        : slug(payload.request?.name ?? "request");
  const filename = `openputman-${payload.kind}-${namePart}-${stamp}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "item"
  );
}
