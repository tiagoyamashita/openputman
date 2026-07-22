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

export function emptyWorkspace(): Workspace {
  const group = emptyGroup("Example site", "https://httpbin.org");
  return {
    version: 1,
    groups: [group],
    environments: [],
    activeEnvironmentId: null,
    collections: [emptyCollection("My Collection", group.id)],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize older workspaces that lack groups / groupId. */
export function normalizeWorkspace(value: unknown): Workspace | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.collections)) {
    return null;
  }

  const groups: WebsiteGroup[] = Array.isArray(value.groups)
    ? value.groups
        .filter(isRecord)
        .map((g) => ({
          id: typeof g.id === "string" ? g.id : createId(),
          name: typeof g.name === "string" ? g.name : "Website",
          website: typeof g.website === "string" ? g.website : "",
        }))
    : [];

  const collections: Collection[] = value.collections.filter(isRecord).map((c) => ({
    id: typeof c.id === "string" ? c.id : createId(),
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
