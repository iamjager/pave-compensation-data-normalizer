/**
 * Null-safe dot-path lookup. Returns undefined when any segment is missing
 * or a parent is null (e.g. Acme's `bonus_plan: null` → `bonus_plan.target_pct`).
 */
export function getPath(obj: unknown, dotPath: string): unknown {
  if (!dotPath) return undefined;
  let current: unknown = obj;
  for (const part of dotPath.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
