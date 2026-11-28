import { test } from "node:test";
import assert from "node:assert/strict";
import { amareSummary, artidesSummary, importRows, jobAmount, parseCsv, toDate, type Amare, type Artides } from "../lib/data/business.ts";

const T = "2026-11-28";
const art: Artides = {
  projects: [
    { id: "1", client: "Tan", value: 18000, paid: 9000, stage: "production", installDate: "2026-12-02", milestones: [{ id: "m", name: "Carcass delivered", due: "2026-11-25" }, { id: "n", name: "Measure", due: "2026-11-01", done: true }], createdAt: "", updatedAt: "" },
    { id: "2", client: "Lim", value: 9500, paid: 0, stage: "design", createdAt: "", updatedAt: "" },
    { id: "3", client: "Old", value: 5000, paid: 5000, stage: "completed", createdAt: "", updatedAt: "" },
  ],
  quotes: [
    { id: "a", client: "Ng", title: "Kitchen", amount: 12000, status: "sent", followUp: "2026-11-27", createdAt: "2026-11-20" },
    { id: "b", client: "Wong", title: "Wardrobe", amount: 6000, status: "won", sentAt: "2026-11-03", createdAt: "2026-11-03" },
    { id: "c", client: "Ali", title: "TV", amount: 3000, status: "lost", createdAt: "2026-10-03" },
  ],
};

test("Artides summary", () => {
  const s = artidesSummary(art, T);
  assert.equal(s.activeProjects, 2);
  assert.equal(s.activeValue, 27500);
  assert.equal(s.outstanding, 18500);
  assert.equal(s.overdueMilestones, 1);
  assert.equal(s.overdue[0].daysLate, 3);
  assert.equal(s.installationsThisWeek, 1);
  assert.equal(s.quotationsPending, 1);
  assert.equal(s.pipelineValue, 12000);
  assert.equal(s.followUpsDue.length, 1);
  assert.equal(s.wonThisMonth, 6000);
  assert.equal(s.winRate, 0.5);
  assert.equal(artidesSummary(null, T).activeProjects, 0);
});

const ama: Amare = {
  jobs: [
    { id: "1", client: "A", title: "Manual", source: "EN", target: "ZH", words: 5000, rate: 0.12, due: "2026-11-30", status: "translating", createdAt: "2026-11-20" },
    { id: "2", client: "B", title: "Menu", source: "EN", target: "MS", words: 800, rate: 0.1, fee: 150, status: "qa", due: "2026-11-26", createdAt: "2026-11-21" },
    { id: "3", client: "C", title: "Web", source: "EN", target: "ZH", words: 3000, rate: 0.12, status: "delivered", deliveredAt: "2026-11-10", createdAt: "2026-11-01" },
    { id: "4", client: "D", title: "Old", source: "ZH", target: "EN", words: 2000, rate: 0.15, status: "invoiced", deliveredAt: "2026-10-20", createdAt: "2026-10-01" },
  ],
};
test("Amare summary", () => {
  const s = amareSummary(ama, T);
  assert.equal(s.jobsInProgress, 2);
  assert.equal(s.dueThisWeek, 1);
  assert.equal(s.overdue.length, 1);
  assert.equal(s.qaPending, 1);
  assert.equal(s.wordsThisMonth, 3000);
  assert.equal(s.revenueThisMonth, 360);
  assert.equal(s.toInvoice, 360);
  assert.equal(s.unpaid, 300);
  assert.equal(jobAmount({ words: 800, rate: 0.1, fee: 150 }), 150);
  assert.deepEqual(s.byPair[0], ["EN→ZH", 8000]);
});

test("CSV parsing and dates", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n\n1,2'), [["a", "b"], ["x, y", 'he said "hi"'], ["1", "2"]]);
  assert.deepEqual(parseCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
  assert.equal(toDate("28/11/2026"), "2026-11-28");
  assert.equal(toDate("2026-1-5"), "2026-01-05");
  assert.equal(toDate("5-1-26"), "2026-01-05");
  assert.equal(toDate(""), undefined);
});

test("import from someone's own spreadsheet columns", () => {
  const p = importRows("projects", parseCsv("Project name,Client,Contract (RM),Deposit,Status,Install date\nKitchen,Mr Tan,\"18,000\",9000,In production,02/12/2026\n,,,,,"), "now", () => "x");
  assert.equal(p.records.length, 1);
  assert.equal(p.skipped, 0);
  assert.deepEqual(p.records[0], { id: "pj-x", client: "Mr Tan", phone: undefined, site: undefined, type: "Kitchen", value: 18000, paid: 9000, stage: "production", installDate: "2026-12-02", notes: undefined, createdAt: "now", updatedAt: "now" });
  const j = importRows("jobs", parseCsv("Customer,Document,Language pair,Word count,Rate,Deadline,Status\nACME,Manual,EN → ZH,5000,0.12,30/11/2026,in progress"), "now", () => "y");
  assert.equal((j.records[0] as { source: string }).source, "EN");
  assert.equal((j.records[0] as { target: string }).target, "ZH");
  assert.equal((j.records[0] as { status: string }).status, "translating");
  const q = importRows("quotes", parseCsv("Client,Amount,Status\nA,1200,Accepted\nB,800,Rejected\nC,500,"), "now");
  assert.deepEqual(q.records.map((r) => (r as { status: string }).status), ["won", "lost", "sent"]);
});
