/** Actions staff may PROPOSE in chat; each runs only when the CEO taps Approve. Shared by server and browser. */
export const STAFF_ACTIONS = {
  send_packing_email: { label: "Email the airway bills + packing list now", short: "Send airway bills", who: ["emp-orders"] },
  check_orders: { label: "Check for new orders and confirm them now", short: "Check orders now", who: ["emp-orders"] },
  send_briefing: { label: "Send today's briefing to Telegram now", short: "Send briefing", who: ["emp-ea"] },
} as const;
export type StaffAction = keyof typeof STAFF_ACTIONS;
export interface ProposedAction {
  action: StaffAction;
  label: string;
  note: string;
}
export const actionsFor = (employeeId: string) => (Object.keys(STAFF_ACTIONS) as StaffAction[]).filter((a) => (STAFF_ACTIONS[a].who as readonly string[]).includes(employeeId));
export const isStaffAction = (x: unknown): x is StaffAction => typeof x === "string" && x in STAFF_ACTIONS;
