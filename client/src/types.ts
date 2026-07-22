export type HeaderRow = {
  key: string;
  value: string;
  enabled: boolean;
};

export type BodyType = "none" | "json" | "raw";

export type ApiRequest = {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: HeaderRow[];
  body: string;
  bodyType: BodyType;
};

export type WebsiteGroup = {
  id: string;
  name: string;
  website: string;
};

export type Collection = {
  id: string;
  name: string;
  groupId: string | null;
  requests: ApiRequest[];
};

export type Environment = {
  id: string;
  name: string;
  variables: Record<string, string>;
};

export type Project = {
  id: string;
  name: string;
  groups: WebsiteGroup[];
  collections: Collection[];
};

export type Workspace = {
  version: 1;
  projects: Project[];
  activeProjectId: string | null;
  environments: Environment[];
  activeEnvironmentId: string | null;
};

export type User = {
  login: string;
  avatar: string;
  name: string | null;
};

export type ProxyResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  sizeBytes: number;
};

export function createId(): string {
  return crypto.randomUUID();
}

export function emptyRequest(name = "New Request"): ApiRequest {
  return {
    id: createId(),
    name,
    method: "GET",
    url: "https://httpbin.org/get",
    headers: [{ key: "", value: "", enabled: true }],
    body: "",
    bodyType: "none",
  };
}

export function emptyGroup(name = "Website", website = ""): WebsiteGroup {
  return {
    id: createId(),
    name,
    website,
  };
}

export function emptyCollection(
  name = "My Collection",
  groupId: string | null = null,
): Collection {
  return {
    id: createId(),
    name,
    groupId,
    requests: [emptyRequest()],
  };
}

export function emptyProject(name = "My Project"): Project {
  const group = emptyGroup("Example site", "https://httpbin.org");
  return {
    id: createId(),
    name,
    groups: [group],
    collections: [emptyCollection("My Collection", group.id)],
  };
}

export function emptyWorkspace(): Workspace {
  const project = emptyProject("My Project");
  return {
    version: 1,
    projects: [project],
    activeProjectId: project.id,
    environments: [],
    activeEnvironmentId: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCollection(c: Record<string, unknown>): Collection {
  return {
    id: typeof c.id === "string" ? c.id : createId(),
    name: typeof c.name === "string" ? c.name : "Collection",
    groupId: typeof c.groupId === "string" ? c.groupId : null,
    requests: Array.isArray(c.requests) ? (c.requests as ApiRequest[]) : [],
  };
}

function normalizeGroup(g: Record<string, unknown>): WebsiteGroup {
  return {
    id: typeof g.id === "string" ? g.id : createId(),
    name: typeof g.name === "string" ? g.name : "Website",
    website: typeof g.website === "string" ? g.website : "",
  };
}

function normalizeProject(p: Record<string, unknown>): Project {
  return {
    id: typeof p.id === "string" ? p.id : createId(),
    name: typeof p.name === "string" ? p.name : "Project",
    groups: Array.isArray(p.groups)
      ? p.groups.filter(isRecord).map(normalizeGroup)
      : [],
    collections: Array.isArray(p.collections)
      ? p.collections.filter(isRecord).map(normalizeCollection)
      : [],
  };
}

/** Normalize older workspaces (flat groups/collections) into projects. */
export function normalizeWorkspace(value: unknown): Workspace | null {
  if (!isRecord(value) || value.version !== 1) return null;

  const environments = Array.isArray(value.environments)
    ? (value.environments as Environment[])
    : [];
  const activeEnvironmentId =
    typeof value.activeEnvironmentId === "string" ? value.activeEnvironmentId : null;

  if (Array.isArray(value.projects) && value.projects.length > 0) {
    const projects = value.projects.filter(isRecord).map(normalizeProject);
    const activeProjectId =
      typeof value.activeProjectId === "string" &&
      projects.some((p) => p.id === value.activeProjectId)
        ? value.activeProjectId
        : (projects[0]?.id ?? null);
    return {
      version: 1,
      projects,
      activeProjectId,
      environments,
      activeEnvironmentId,
    };
  }

  // Legacy flat workspace → one default project
  if (!Array.isArray(value.collections)) return null;

  const groups = Array.isArray(value.groups)
    ? value.groups.filter(isRecord).map(normalizeGroup)
    : [];
  const collections = value.collections.filter(isRecord).map(normalizeCollection);
  const project: Project = {
    id: createId(),
    name: "My Project",
    groups,
    collections,
  };

  return {
    version: 1,
    projects: [project],
    activeProjectId: project.id,
    environments,
    activeEnvironmentId,
  };
}

export function getActiveProject(workspace: Workspace): Project | null {
  return (
    workspace.projects.find((project) => project.id === workspace.activeProjectId) ??
    workspace.projects[0] ??
    null
  );
}

export function withActiveProject(
  workspace: Workspace,
  updater: (project: Project) => Project,
): Workspace {
  const active = getActiveProject(workspace);
  if (!active) return workspace;
  const next = updater(active);
  return {
    ...workspace,
    activeProjectId: next.id,
    projects: workspace.projects.map((project) =>
      project.id === active.id ? next : project,
    ),
  };
}
