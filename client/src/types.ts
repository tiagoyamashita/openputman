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

export type Collection = {
  id: string;
  name: string;
  requests: ApiRequest[];
};

export type Environment = {
  id: string;
  name: string;
  variables: Record<string, string>;
};

export type Workspace = {
  version: 1;
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

export function emptyCollection(name = "My Collection"): Collection {
  return {
    id: createId(),
    name,
    requests: [emptyRequest()],
  };
}

export function emptyWorkspace(): Workspace {
  return {
    version: 1,
    environments: [],
    activeEnvironmentId: null,
    collections: [emptyCollection()],
  };
}
