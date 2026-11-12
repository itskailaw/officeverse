// Module-level singleton for the agent simulation so React components and
// HUD actions share one instance without re-render churn.
import { OfficeSim } from "./sim.ts";
import { DEFAULT_LAYOUT } from "./layout.ts";

let instance: OfficeSim | null = null;

export function getSim(): OfficeSim {
  if (!instance) instance = new OfficeSim(DEFAULT_LAYOUT);
  return instance;
}
