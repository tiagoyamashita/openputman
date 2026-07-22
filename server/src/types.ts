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

export const GIST_DESCRIPTION = "openputman-workspace";
export const GIST_FILENAME = "openputman-workspace.json";

export function emptyWorkspace(): Workspace {
  return {
    version: 1,
    environments: [],
    activeEnvironmentId: null,
    collections: [
      {
        id: crypto.randomUUID(),
        name: "My Collection",
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

export function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const w = value as Workspace;
  return w.version === 1 && Array.isArray(w.collections) && Array.isArray(w.environments);
}
