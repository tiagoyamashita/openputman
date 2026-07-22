/** Parse JSON only when input is non-empty; never call JSON.parse on "". */
export function safeJsonParse(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** Pretty-print JSON bodies; leave non-JSON / empty bodies unchanged. */
export function formatJsonBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return body;
  if (trimmed[0] !== "{" && trimmed[0] !== "[" && trimmed[0] !== '"') {
    return body;
  }
  const parsed = safeJsonParse(trimmed);
  if (parsed === undefined) return body;
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}
