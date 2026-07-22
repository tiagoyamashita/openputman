import { safeJsonParse } from "./json";
import type { ProxyResponse, RequestExtract } from "./types";

/** Resolve dotted paths like `data.token` or `items.0.id`. */
export function getByPath(root: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(".").filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function valueToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function extractFromResponse(
  response: ProxyResponse,
  source: "body" | "header",
  path: string,
): string | null {
  const key = path.trim();
  if (!key) return null;

  if (source === "header") {
    const lower = key.toLowerCase();
    for (const [name, value] of Object.entries(response.headers)) {
      if (name.toLowerCase() === lower) return value;
    }
    return null;
  }

  const parsed = safeJsonParse(response.body);
  if (parsed === undefined) return null;
  return valueToString(getByPath(parsed, key));
}

export function applyExtracts(
  response: ProxyResponse,
  extracts: RequestExtract[],
  vars: Record<string, string>,
): { vars: Record<string, string>; applied: string[]; failed: string[] } {
  const next = { ...vars };
  const applied: string[] = [];
  const failed: string[] = [];

  for (const rule of extracts) {
    const name = rule.variable.trim();
    if (!name) continue;
    const value = extractFromResponse(response, rule.source, rule.path);
    if (value === null) {
      failed.push(name);
      continue;
    }
    next[name] = value;
    applied.push(name);
  }

  return { vars: next, applied, failed };
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 400;
}
