// One-time team changes applied to existing offices (local and cloud).
// Pure functions so they can be unit-tested.

import type { Employee } from "./types.ts";

export interface TeamMerge {
  id: string;
  keepId: string;
  removeId: string;
  title: string;
  personality: string;
}

export const TEAM_MERGES: TeamMerge[] = [
  {
    id: "2026-11-merge-ba-strategy",
    keepId: "emp-ba",
    removeId: "emp-strat",
    title: "Business & Strategy Analyst",
    personality: "Curious pattern-finder who explains trends in plain language and turns them into practical growth recommendations.",
  },
  {
    id: "2026-11-merge-inventory-procurement",
    keepId: "emp-inv",
    removeId: "emp-proc",
    title: "Inventory & Purchasing Manager",
    personality: "Organised and forward-looking; thinks in weeks of cover and compares every supplier quote before reordering.",
  },
];

const union = <T,>(a: T[], b: T[]) => [...a, ...b.filter((x) => !a.includes(x))];

/** Apply merges not yet recorded in `applied`. Returns the new list plus a human summary of what changed. */
export function applyTeamMerges(employees: Employee[], applied: string[]) {
  let list = employees;
  const done = [...applied];
  const changes: string[] = [];
  for (const m of TEAM_MERGES) {
    if (done.includes(m.id)) continue;
    done.push(m.id);
    const keep = list.find((e) => e.id === m.keepId);
    if (!keep) continue;
    const gone = list.find((e) => e.id === m.removeId);
    const merged: Employee = {
      ...keep,
      title: m.title,
      personality: m.personality,
      responsibilities: union(keep.responsibilities, gone?.responsibilities ?? []),
      permissions: union(keep.permissions, gone?.permissions ?? []),
    };
    list = list.map((e) => (e.id === keep.id ? merged : e.id === gone?.id ? { ...e, active: false, workstationId: null, status: "available" as const } : e));
    changes.push(gone ? `${keep.name} is now ${m.title} (took over from ${gone.name}, who was deactivated)` : `${keep.name} is now ${m.title}`);
  }
  return { employees: list, applied: done, changes };
}
