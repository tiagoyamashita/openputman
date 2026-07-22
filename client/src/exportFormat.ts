import {
  createId,
  emptyCollection,
  getActiveProject,
  normalizeWorkspace,
  withActiveProject,
  type ApiRequest,
  type Collection,
  type Project,
  type WebsiteGroup,
  type Workspace,
} from "./types";
import { safeJsonParse } from "./json";

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

  const project = getActiveProject(workspace);
  const collection =
    project?.collections.find((c) => c.id === collectionId) ?? project?.collections[0];
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
  if (!raw.trim()) {
    throw new Error("Export file is empty");
  }

  const parsed: unknown = safeJsonParse(raw);
  if (parsed === undefined) {
    throw new Error("Export file must be valid JSON");
  }

  if (!isRecord(parsed) || parsed.format !== "openputman" || parsed.version !== 1) {
    throw new Error('Not an OpenPutMan export (expected format "openputman" version 1)');
  }

  const kind = parsed.kind;
  if (kind !== "workspace" && kind !== "collection" && kind !== "request") {
    throw new Error("Export kind must be workspace, collection, or request");
  }

  if (kind === "workspace") {
    const workspace = normalizeWorkspace(parsed.workspace);
    if (!workspace) throw new Error("Invalid workspace in export");
    return {
      format: "openputman",
      version: 1,
      kind,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
      workspace,
    };
  }

  if (kind === "collection") {
    if (!isCollection(parsed.collection)) throw new Error("Invalid collection in export");
    const collection = parsed.collection;
    return {
      format: "openputman",
      version: 1,
      kind,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
      collection: {
        ...collection,
        groupId: typeof collection.groupId === "string" ? collection.groupId : null,
      },
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

function remintCollection(collection: Collection, groupId: string | null = null): Collection {
  return {
    ...collection,
    id: createId(),
    groupId,
    requests: collection.requests.map(remintRequest),
  };
}

function remintGroup(group: WebsiteGroup): WebsiteGroup {
  return { ...group, id: createId() };
}

function remintProject(project: Project): Project {
  const groupIdMap = new Map<string, string>();
  const groups = project.groups.map((group) => {
    const next = remintGroup(group);
    groupIdMap.set(group.id, next.id);
    return next;
  });
  return {
    ...project,
    id: createId(),
    groups,
    collections: project.collections.map((collection) =>
      remintCollection(
        collection,
        collection.groupId ? (groupIdMap.get(collection.groupId) ?? null) : null,
      ),
    ),
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
      const incoming = payload.workspace;
      if (!incoming) throw new Error("Missing workspace in export");
      const projects =
        incoming.projects.length > 0
          ? incoming.projects.map(remintProject)
          : current.projects.map(remintProject);
      const workspace: Workspace = {
        version: 1,
        projects,
        activeProjectId: projects[0]?.id ?? null,
        environments: incoming.environments ?? [],
        activeEnvironmentId: incoming.activeEnvironmentId ?? null,
      };
      const first = getActiveProject(workspace)?.collections[0];
      return {
        workspace,
        collectionId: first?.id ?? null,
        requestId: first?.requests[0]?.id ?? null,
      };
    }
    case "collection": {
      if (!payload.collection) throw new Error("Missing collection in export");
      const collection = remintCollection(payload.collection, null);
      const workspace = withActiveProject(current, (project) => ({
        ...project,
        collections: [...project.collections, collection],
      }));
      return {
        workspace,
        collectionId: collection.id,
        requestId: collection.requests[0]?.id ?? null,
      };
    }
    case "request": {
      if (!payload.request) throw new Error("Missing request in export");
      const request = remintRequest(payload.request);
      const active = getActiveProject(current);
      const targetId =
        activeCollectionId && active?.collections.some((c) => c.id === activeCollectionId)
          ? activeCollectionId
          : active?.collections[0]?.id;

      if (!targetId) {
        const collection = emptyCollection("Imported", null);
        collection.requests = [request];
        const workspace = withActiveProject(current, (project) => ({
          ...project,
          collections: [...project.collections, collection],
        }));
        return {
          workspace,
          collectionId: collection.id,
          requestId: request.id,
        };
      }

      const workspace = withActiveProject(current, (project) => ({
        ...project,
        collections: project.collections.map((collection) =>
          collection.id === targetId
            ? { ...collection, requests: [...collection.requests, request] }
            : collection,
        ),
      }));
      return {
        workspace,
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
