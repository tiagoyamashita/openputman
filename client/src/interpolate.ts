const VAR_RE = /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g;

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(VAR_RE, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name]! : match,
  );
}

export function findUnresolved(template: string, vars: Record<string, string>): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(VAR_RE)) {
    const name = match[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (!Object.prototype.hasOwnProperty.call(vars, name)) {
      missing.push(name);
    }
  }
  return missing;
}

export function collectUnresolved(
  parts: string[],
  vars: Record<string, string>,
): string[] {
  const all = new Set<string>();
  for (const part of parts) {
    for (const name of findUnresolved(part, vars)) {
      all.add(name);
    }
  }
  return [...all];
}
