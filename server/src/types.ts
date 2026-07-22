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

export type Workspace = {
  version: 1;
  groups: WebsiteGroup[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  collections: Collection[];
};

export const GIST_DESCRIPTION = "openputman-workspace";
export const GIST_FILENAME = "openputman-workspace.json";

export function emptyWorkspace(): Workspace {
  const groupId = crypto.randomUUID();
  return {
    version: 1,
    groups: [
      {
        id: groupId,
        name: "Example site",
        website: "https://httpbin.org",
      },
    ],
    environments: [],
    activeEnvironmentId: null,
    collections: [
      {
        id: crypto.randomUUID(),
        name: "My Collection",
        groupId,
        requests: [
          {
            id: crypto.randomUUID(),
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
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeWorkspace(value: unknown): Workspace | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.collections)) {
    return null;
  }

  const groups: WebsiteGroup[] = Array.isArray(value.groups)
    ? value.groups
        .filter(isRecord)
        .map((g) => ({
          id: typeof g.id === "string" ? g.id : crypto.randomUUID(),
          name: typeof g.name === "string" ? g.name : "Website",
          website: typeof g.website === "string" ? g.website : "",
        }))
    : [];

  const collections: Collection[] = value.collections.filter(isRecord).map((c) => ({
    id: typeof c.id === "string" ? c.id : crypto.randomUUID(),
    name: typeof c.name === "string" ? c.name : "Collection",
    groupId: typeof c.groupId === "string" ? c.groupId : null,
    requests: Array.isArray(c.requests) ? (c.requests as ApiRequest[]) : [],
  }));

  return {
    version: 1,
    groups,
    environments: Array.isArray(value.environments)
      ? (value.environments as Environment[])
      : [],
    activeEnvironmentId:
      typeof value.activeEnvironmentId === "string" ? value.activeEnvironmentId : null,
    collections,
  };
}

export function isWorkspace(value: unknown): value is Workspace {
  return normalizeWorkspace(value) !== null;
}
