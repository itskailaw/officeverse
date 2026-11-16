import type { Company, Department } from "./types.ts";

/** Colours for shared-service departments that don't belong to one company. */
export const SHARED_DEPT_COLORS: Record<string, string> = {
  "dept-finance": "#0f766e",
  "dept-marketing": "#e11d48",
  "dept-it": "#16a34a",
  "dept-exec": "#d4a017",
};

export function departmentColor(dept: Department | undefined, companies: Company[]) {
  if (!dept) return "#1e3a5f";
  return companies.find((c) => c.id === dept.companyId)?.color ?? SHARED_DEPT_COLORS[dept.id] ?? "#1e3a5f";
}
