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

export const GIST_DESCRIPTION = "openputman-workspace";
export const GIST_FILENAME = "openputman-workspace.json";

function createId(): string {
  return crypto.randomUUID();
}

export function emptyWorkspace(): Workspace {
  const groupId = createId();
  const projectId = createId();
  return {
    version: 1,
    projects: [
      {
        id: projectId,
        name: "My Project",
        groups: [
          {
            id: groupId,
            name: "Example site",
            website: "https://httpbin.org",
          },
        ],
        collections: [
          {
            id: createId(),
            name: "My Collection",
            groupId,
            requests: [
              {
                id: createId(),
                name: "New Request",
                method: "GET",
                url: "https://httpbin.org/get",
                headers: [{ key: "", value: "", enabled: true }],
                body: "",
                bodyType: "none",
              },
            ],
          },
        ],
      },
    ],
    activeProjectId: projectId,
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
    groups: Array.isArray(p.groups) ? p.groups.filter(isRecord).map(normalizeGroup) : [],
    collections: Array.isArray(p.collections)
      ? p.collections.filter(isRecord).map(normalizeCollection)
      : [],
  };
}

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

export function isWorkspace(value: unknown): value is Workspace {
  return normalizeWorkspace(value) !== null;
}
