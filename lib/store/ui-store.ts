"use client";

import { create } from "zustand";

export type Mode = "live" | "build";
export type Dialog = null | "dashboard" | "meeting-call" | "hire" | "settings" | "team" | "edit-employee" | "fulfil" | "purchases" | "subtitles" | "stock";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

interface UIState {
  mode: Mode;
  selectedEmployeeId: string | null;
  hoveredId: string | null;
  heldId: string | null;
  selectedFurnitureId: string | null;
  draggingFurniture: boolean;
  furnitureDrag: { id: string; x: number; z: number; dx: number; dz: number } | null;
  dialog: Dialog;
  editEmployeeId: string | null;
  dashboardTab: string;
  settingsTab: string;
  fulfilStage: "process" | "ship";
  notificationsOpen: boolean;
  companyFilter: string | "all";
  cameraCommand: { kind: "rotate"; dir: 1 | -1; n: number } | { kind: "zoom"; dir: 1 | -1; n: number } | { kind: "reset"; n: number } | { kind: "save"; n: number } | { kind: "focus"; x: number; z: number; zoom?: number; n: number } | null;
  toasts: Toast[];
  set(patch: Partial<UIState>): void;
  toast(kind: Toast["kind"], text: string): void;
  dismiss(id: number): void;
  camera(cmd: { kind: "rotate"; dir: 1 | -1 } | { kind: "zoom"; dir: 1 | -1 } | { kind: "reset" } | { kind: "save" } | { kind: "focus"; x: number; z: number; zoom?: number }): void;
}

let toastId = 0;
let camN = 0;

export const useUI = create<UIState>()((set) => ({
  mode: "live",
  selectedEmployeeId: null,
  hoveredId: null,
  heldId: null,
  selectedFurnitureId: null,
  draggingFurniture: false,
  furnitureDrag: null,
  dialog: null,
  fulfilStage: "process",
  editEmployeeId: null,
  dashboardTab: "overview",
  settingsTab: "office",
  notificationsOpen: false,
  companyFilter: "all",
  cameraCommand: null,
  toasts: [],
  set: (patch) => set(patch),
  toast: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  camera: (cmd) => set({ cameraCommand: { ...cmd, n: ++camN } as UIState["cameraCommand"] }),
}));
