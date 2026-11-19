// Pure helpers for the Telegram bot (unit-tested).

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Light Markdown → Telegram HTML (bold, italics, code, headings, bullets). Tables stay as plain text. */
export function mdToTelegram(md: string) {
  return esc(md)
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])_(?!_)(.+?)_(?=[\s).,!?]|$)/gm, "$1<i>$2</i>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface StaffRef {
  id: string;
  name: string;
}

/**
 * Who should answer: "ask Daniel …", "Daniel, …", "@daniel …" or "/ask daniel …" pick that employee
 * (first name, case-insensitive); otherwise the default (the executive assistant).
 * Returns the employee and the message with the addressing removed.
 */
export function pickRecipient(text: string, staff: StaffRef[], fallbackId: string): { id: string; message: string } {
  const t = text.trim();
  const m = /^(?:\/ask(?:@\w+)?\s+|ask\s+|tanya\s+|@)?([A-Za-z][A-Za-z'-]+)[\s,:]+([\s\S]+)$/i.exec(t);
  if (m) {
    const first = m[1].toLowerCase();
    const hit = staff.find((e) => e.name.split(/\s+/)[0].toLowerCase() === first);
    if (hit) return { id: hit.id, message: m[2].trim() };
  }
  return { id: fallbackId, message: t };
}
