export const money = (value: unknown, currency?: unknown): string => {
  if (typeof value !== "number") return "—";
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency && typeof currency === "string" ? `${formatted} ${currency}` : formatted;
};

export const titleCase = (id: string): string =>
  id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const pctLabel = (rate: number): string => `${Math.round(rate * 100)}%`;

export const previewValue = (value: unknown): string => {
  if (value === null || value === undefined) return "∅";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  return s.length > 42 ? `${s.slice(0, 42)}…` : s;
};
