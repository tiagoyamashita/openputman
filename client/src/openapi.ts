import { load as loadYaml } from "js-yaml";
import { safeJsonParse } from "./json";
import {
  createId,
  type ApiRequest,
  type BodyType,
  type Collection,
  type HeaderRow,
} from "./types";

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinUrl(base: string, path: string): string {
  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!cleanBase) return cleanPath;
  return `${cleanBase}${cleanPath}`;
}

function resolveServerUrl(doc: Record<string, unknown>): string {
  if (typeof doc.openapi === "string" || typeof doc.openapi === "number") {
    const servers = Array.isArray(doc.servers) ? doc.servers : [];
    const first = servers[0];
    if (isRecord(first) && typeof first.url === "string") {
      return first.url.replace(/\/+$/, "");
    }
    return "";
  }

  if (doc.swagger === "2.0") {
    const schemes = Array.isArray(doc.schemes) ? doc.schemes : ["https"];
    const scheme = typeof schemes[0] === "string" ? schemes[0] : "https";
    const host = typeof doc.host === "string" ? doc.host : "localhost";
    const basePath = typeof doc.basePath === "string" ? doc.basePath : "";
    return `${scheme}://${host}${basePath}`.replace(/\/+$/, "");
  }

  return "";
}

function exampleFromSchema(schema: unknown, depth = 0): Json {
  if (!isRecord(schema) || depth > 4) return null;

  if ("example" in schema) return schema.example as Json;
  if ("default" in schema) return schema.default as Json;

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0] as Json;
  }

  const type = typeof schema.type === "string" ? schema.type : undefined;

  switch (type) {
    case "string":
      return typeof schema.format === "string" && schema.format === "date-time"
        ? new Date().toISOString()
        : "string";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return true;
    case "array":
      return [exampleFromSchema(schema.items, depth + 1)];
    case "object": {
      if (isRecord(schema.properties)) {
        const obj: Record<string, Json> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
          obj[key] = exampleFromSchema(prop, depth + 1);
        }
        return obj;
      }
      return {};
    }
    case undefined: {
      if (isRecord(schema.properties)) {
        const obj: Record<string, Json> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
          obj[key] = exampleFromSchema(prop, depth + 1);
        }
        return obj;
      }
      return null;
    }
    default:
      return null;
  }
}

function buildBody(operation: Record<string, unknown>): {
  body: string;
  bodyType: BodyType;
  contentType: string | null;
} {
  // OpenAPI 3 requestBody
  if (isRecord(operation.requestBody) && isRecord(operation.requestBody.content)) {
    const content = operation.requestBody.content;
    const json = content["application/json"];
    if (isRecord(json)) {
      const schema = json.schema;
      const example =
        "example" in json
          ? json.example
          : Array.isArray(json.examples)
            ? undefined
            : isRecord(json.examples)
              ? Object.values(json.examples)[0]
              : undefined;
      let value: Json = null;
      if (example !== undefined) {
        value = isRecord(example) && "value" in example ? (example.value as Json) : (example as Json);
      } else {
        value = exampleFromSchema(schema);
      }
      return {
        body: value == null ? "" : JSON.stringify(value, null, 2),
        bodyType: "json",
        contentType: "application/json",
      };
    }

    const firstKey = Object.keys(content)[0];
    if (firstKey) {
      return { body: "", bodyType: "raw", contentType: firstKey };
    }
  }

  // Swagger 2 body parameter
  if (Array.isArray(operation.parameters)) {
    for (const param of operation.parameters) {
      if (!isRecord(param) || param.in !== "body") continue;
      const value =
        "example" in param ? (param.example as Json) : exampleFromSchema(param.schema);
      return {
        body: value == null ? "" : JSON.stringify(value, null, 2),
        bodyType: "json",
        contentType: "application/json",
      };
    }
  }

  return { body: "", bodyType: "none", contentType: null };
}

function buildHeaders(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  contentType: string | null,
): HeaderRow[] {
  const headers: HeaderRow[] = [];
  const paramLists = [pathItem.parameters, operation.parameters];

  for (const list of paramLists) {
    if (!Array.isArray(list)) continue;
    for (const param of list) {
      if (!isRecord(param) || param.in !== "header") continue;
      if (typeof param.name !== "string" || !param.name) continue;
      const value =
        typeof param.example === "string" || typeof param.example === "number"
          ? String(param.example)
          : "";
      headers.push({ key: param.name, value, enabled: true });
    }
  }

  if (contentType) {
    headers.push({ key: "Content-Type", value: contentType, enabled: true });
  }

  if (headers.length === 0) {
    headers.push({ key: "", value: "", enabled: true });
  }

  return headers;
}

function buildQuerySuffix(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
): string {
  const params: string[] = [];
  const paramLists = [pathItem.parameters, operation.parameters];

  for (const list of paramLists) {
    if (!Array.isArray(list)) continue;
    for (const param of list) {
      if (!isRecord(param) || param.in !== "query") continue;
      if (typeof param.name !== "string" || !param.name) continue;
      const value =
        typeof param.example === "string" || typeof param.example === "number"
          ? String(param.example)
          : "";
      params.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`);
    }
  }

  return params.length ? `?${params.join("&")}` : "";
}

function operationName(
  method: string,
  path: string,
  operation: Record<string, unknown>,
): string {
  if (typeof operation.summary === "string" && operation.summary.trim()) {
    return operation.summary.trim();
  }
  if (typeof operation.operationId === "string" && operation.operationId.trim()) {
    return operation.operationId.trim();
  }
  return `${method.toUpperCase()} ${path}`;
}

export function parseOpenApiDocument(raw: string): Collection {
  if (!raw.trim()) {
    throw new Error("OpenAPI document is empty");
  }

  let parsed: unknown = safeJsonParse(raw);
  if (parsed === undefined) {
    parsed = loadYaml(raw);
  }

  if (!isRecord(parsed)) {
    throw new Error("OpenAPI document must be a JSON or YAML object");
  }

  const isOas3 = typeof parsed.openapi === "string";
  const isSwagger2 = parsed.swagger === "2.0";
  if (!isOas3 && !isSwagger2) {
    throw new Error("Unsupported spec — expected OpenAPI 3.x or Swagger 2.0");
  }

  if (!isRecord(parsed.paths)) {
    throw new Error("OpenAPI document has no paths");
  }

  const baseUrl = resolveServerUrl(parsed);
  const info = isRecord(parsed.info) ? parsed.info : {};
  const title =
    typeof info.title === "string" && info.title.trim()
      ? info.title.trim()
      : "Imported API";

  const requests: ApiRequest[] = [];

  for (const [path, pathValue] of Object.entries(parsed.paths)) {
    if (!isRecord(pathValue)) continue;
    for (const [method, operationValue] of Object.entries(pathValue)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (!isRecord(operationValue)) continue;

      const { body, bodyType, contentType } = buildBody(operationValue);
      const headers = buildHeaders(operationValue, pathValue, contentType);
      const query = buildQuerySuffix(operationValue, pathValue);

      requests.push({
        id: createId(),
        name: operationName(method, path, operationValue),
        method: method.toUpperCase(),
        url: `${joinUrl(baseUrl, path)}${query}`,
        headers,
        body,
        bodyType,
        extracts: [],
      });
    }
  }

  if (requests.length === 0) {
    throw new Error("No HTTP operations found in the OpenAPI paths");
  }

  return {
    id: createId(),
    name: title,
    groupId: null,
    requests,
  };
}
