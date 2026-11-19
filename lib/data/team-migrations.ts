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

/** New seeded employees added to existing offices (once). */
export const TEAM_HIRES: { id: string; employeeId: string }[] = [
  { id: "2026-11-hire-receptionist", employeeId: "emp-recep" },
  { id: "2026-11-hire-order-exec", employeeId: "emp-orders" },
];

const union = <T,>(a: T[], b: T[]) => [...a, ...b.filter((x) => !a.includes(x))];

/** Apply merges not yet recorded in `applied`. Returns the new list plus a human summary of what changed. */
export function applyTeamMerges(employees: Employee[], applied: string[], seed: Employee[] = []) {
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
  for (const h of TEAM_HIRES) {
    if (done.includes(h.id)) continue;
    const hire = seed.find((e) => e.id === h.employeeId);
    if (!hire) continue; // no seed list given (e.g. building the seed itself) — try again next time
    done.push(h.id);
    if (list.some((e) => e.id === hire.id)) continue;
    // free the desk if someone else was moved onto it
    list = [...list.map((e) => (e.workstationId === hire.workstationId ? { ...e, workstationId: null } : e)), hire];
    changes.push(`${hire.name} joined as ${hire.title}`);
  }
  return { employees: list, applied: done, changes };
}
