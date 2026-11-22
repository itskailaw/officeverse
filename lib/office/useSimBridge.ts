"use client";

import { useEffect, useRef } from "react";
import { useOffice, layoutFrom } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { CEO_ID } from "@/lib/data/seed";
import { CEO_DESK_ID } from "./layout";
import { getSim } from "./runtime";

/** Keeps the agent simulation in sync with persisted office state. */
export function useSimBridge() {
  const furniture = useOffice((s) => s.furniture);
  const employees = useOffice((s) => s.employees);
  const ambient = useOffice((s) => s.settings.ambientLife);
  const meetings = useOffice((s) => s.meetings);
  const booted = useRef(false);

  // layout → nav grid
  useEffect(() => {
    getSim().rebuild(layoutFrom(furniture));
  }, [furniture]);

  // employees → agents
  useEffect(() => {
    const sim = getSim();
    sim.addAgent(CEO_ID, CEO_DESK_ID, true);
    const active = employees.filter((e) => e.active);
    const ids = new Set(active.map((e) => e.id));
    for (const id of [...sim.agents.keys()]) if (id !== CEO_ID && !ids.has(id)) sim.removeAgent(id);
    for (const e of active) {
      const a = sim.agents.get(e.id);
      if (!a) sim.addAgent(e.id, e.workstationId);
      else if (a.homeSeatId !== e.workstationId) sim.setHomeSeat(e.id, e.workstationId);
      const ag = sim.agents.get(e.id);
      if (ag) {
        ag.working = e.status === "working";
        ag.gender = e.gender === "male" || e.gender === "female" ? e.gender : undefined;
      }
    }
  }, [employees]);

  useEffect(() => {
    getSim().ambientLife = ambient;
  }, [ambient]);

  // resume an in-progress meeting after reload
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const live = meetings.find((m) => m.status === "in_progress");
    if (live) getSim().callMeeting(live.attendeeIds, CEO_ID);
  }, [meetings]);

  // simulation events → activity log
  useEffect(() => {
    const sim = getSim();
    const lastLog = new Map<string, number>();
    return sim.on((ev) => {
      const st = useOffice.getState();
      const emp = st.employees.find((e) => e.id === ev.agentId);
      if (!emp) return;
      const key = `${ev.agentId}:${ev.type}`;
      const t = Date.now();
      if ((lastLog.get(key) ?? 0) > t - 20000) return;
      lastLog.set(key, t);
      switch (ev.type) {
        case "break_start":
          st.logActivity(emp.id, `${emp.name} went to the Staff Lounge for a short break`);
          break;
        case "arrived_meeting":
          st.logActivity(emp.id, `${emp.name} took a seat in the Meeting Room`);
          break;
        case "reassigned":
          if (ev.seatId) {
            const r = st.assignWorkstation(emp.id, ev.seatId);
            if (r.ok) useUI.getState().toast("success", `${emp.name} now works at this desk`);
          }
          break;
        case "stuck_recovered":
          st.logActivity(emp.id, `Navigation: ${emp.name} re-routed around an obstacle`);
          break;
      }
    });
  }, []);
}
