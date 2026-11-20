"use client";

import { useEffect, useState } from "react";
import { PlugZap, Database, Download, ImagePlus, Lamp, Moon, RotateCcw, Sun, Sunset, Trash2, User } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import type { LightingMode, UITheme, WallMode } from "@/lib/data/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AppearanceEditor } from "./EmployeeEditor";
import { IntegrationsPanel } from "./Integrations";

const MAX_UPLOAD = 5 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/** Validate + downscale an image to a compact JPEG data URL. */
async function toFrameImage(file: File, type: "image/jpeg" | "image/png" = "image/jpeg"): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error("Use a PNG, JPEG or WebP image.");
  if (file.size > MAX_UPLOAD) throw new Error("Image must be under 5 MB.");
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.85);
}

interface Health {
  supabase: boolean;
  ai: boolean;
  integrations: number;
}

export function SettingsDialog() {
  const open = useUI((s) => s.dialog === "settings");
  const setUI = useUI((s) => s.set);
  const tab = useUI((s) => s.settingsTab);
  const toast = useUI((s) => s.toast);
  const s = useOffice();
  const st = s.settings;
  const [health, setHealth] = useState<Health | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, [open]);

  const upload = async (i: number, file?: File) => {
    if (!file) return;
    try {
      const url = await toFrameImage(file);
      const frames = [...st.photoFrames];
      frames[i] = url;
      s.updateSettings({ photoFrames: frames });
      toast("success", "Photo frame updated");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Upload failed");
    }
  };

  const exportData = () => {
    const { companies, departments, employees, tasks, meetings, notifications, audit, settings, furniture } = useOffice.getState();
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), companies, departments, employees, tasks, meetings, notifications, audit, settings, furniture }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "officeverse-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setUI({ dialog: null })}>
      <DialogContent title="Settings" description="Office customisation, CEO profile, notifications and data." className="max-w-2xl">
        <Tabs value={tab} onValueChange={(v) => setUI({ settingsTab: v })} className="flex flex-col">
          <div className="border-b border-slate-100 px-5 py-2">
            <TabsList>
              <TabsTrigger value="office">
                <Lamp /> Office
              </TabsTrigger>
              <TabsTrigger value="ceo">
                <User /> CEO
              </TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="integrations">
                <PlugZap /> Integrations
              </TabsTrigger>
              <TabsTrigger value="data">
                <Database /> Data & system
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="office" className="space-y-5 p-5">
            <div>
              <Label>Lighting</Label>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ["day", <Sun key="d" />, "Day"],
                    ["evening", <Sunset key="e" />, "Evening"],
                    ["night", <Moon key="n" />, "Night"],
                    ["auto", <RotateCcw key="a" />, "Auto (MYT)"],
                  ] as [LightingMode, React.ReactNode, string][]
                ).map(([v, icon, label]) => (
                  <Button key={v} variant={st.lighting === v ? "default" : "outline"} size="sm" onClick={() => s.updateSettings({ lighting: v })}>
                    {icon}
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Walls</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["full", "Walls up"],
                    ["cutaway", "Cut-away"],
                    ["hidden", "Walls down"],
                  ] as [WallMode, string][]
                ).map(([v, label]) => (
                  <Button key={v} variant={st.walls === v ? "default" : "outline"} size="sm" onClick={() => s.updateSettings({ walls: v })}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ColorSetting label="Wall colour" value={st.wallColor} onChange={(v) => s.updateSettings({ wallColor: v })} />
              <ColorSetting label="Accent / trim" value={st.accentColor} onChange={(v) => s.updateSettings({ accentColor: v })} />
              <ColorSetting label="Wood floors" value={st.floorWood} onChange={(v) => s.updateSettings({ floorWood: v })} />
            </div>
            <div>
              <Label>Interface theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["light", "Light"],
                    ["dark", "Dark"],
                    ["auto", "Match lighting"],
                  ] as [UITheme, string][]
                ).map(([v, label]) => (
                  <Button key={v} variant={st.uiTheme === v ? "default" : "outline"} size="sm" onClick={() => s.updateSettings({ uiTheme: v })}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Company logo (reception screen & top bar)</Label>
              <div className="flex items-center gap-3">
                <label className="flex h-14 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 hover:border-navy/40">
                  {st.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={st.logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <ImagePlus className="h-4 w-4" /> Upload
                    </span>
                  )}
                  <input
                    type="file"
                    accept={ALLOWED.join(",")}
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        s.updateSettings({ logoUrl: await toFrameImage(f, "image/png") });
                        toast("success", "Logo updated");
                      } catch (err) {
                        toast("error", err instanceof Error ? err.message : "Upload failed");
                      }
                    }}
                  />
                </label>
                {st.logoUrl && (
                  <Button variant="ghost" size="sm" onClick={() => s.updateSettings({ logoUrl: null })}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <Toggle label="Activity bubbles" hint="Show what each employee is doing above their head." checked={st.showBubbles} onChange={(v) => s.updateSettings({ showBubbles: v })} />
            <Toggle label="Chibi avatars" hint="Bigger heads so faces and expressions show from a distance." checked={st.chibi ?? true} onChange={(v) => s.updateSettings({ chibi: v })} />
            <Toggle
              label="Festive outfits"
              hint="Baju Raya, CNY red, Deepavali and #24 jerseys on Kobe Day — automatically on the day."
              checked={st.festiveOutfits ?? true}
              onChange={(v) => s.updateSettings({ festiveOutfits: v })}
            />
            <Toggle label="Always show name tags" checked={st.showNameTags} onChange={(v) => s.updateSettings({ showNameTags: v })} />
            <Toggle
              label="Ambient office life"
              hint="Employees occasionally take short lounge breaks between work."
              checked={st.ambientLife}
              onChange={(v) => s.updateSettings({ ambientLife: v })}
            />
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Button variant="outline" size="sm" onClick={() => (s.resetAppearance(), toast("success", "Appearance reset to default"))}>
                <RotateCcw /> Reset colours & lighting
              </Button>
              <Button variant="outline" size="sm" onClick={() => (s.resetLayout(), toast("success", "Furniture & desks reset to default"))}>
                <RotateCcw /> Reset furniture layout
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="ceo" className="space-y-5 p-5">
            <div>
              <Label>Display name</Label>
              <Input value={st.ceoName} maxLength={40} onChange={(e) => s.updateSettings({ ceoName: e.target.value })} />
            </div>
            <div>
              <Label>Avatar</Label>
              <AppearanceEditor value={st.ceoAppearance} onChange={(a) => s.updateSettings({ ceoAppearance: a })} />
            </div>
            <div>
              <Label>CEO office photo frames</Label>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <label className="flex aspect-[4/5] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 hover:border-navy/40">
                      {st.photoFrames[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={st.photoFrames[i]!} alt={`Frame ${i + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex flex-col items-center gap-1 text-[11px] text-slate-400">
                          <ImagePlus className="h-5 w-5" /> Frame {i + 1}
                        </span>
                      )}
                      <input type="file" accept={ALLOWED.join(",")} className="hidden" onChange={(e) => upload(i, e.target.files?.[0])} />
                    </label>
                    {st.photoFrames[i] && (
                      <button
                        className="w-full text-center text-[11px] text-slate-500 hover:text-red-600"
                        onClick={() => {
                          const f = [...st.photoFrames];
                          f[i] = null;
                          s.updateSettings({ photoFrames: f });
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Frames 1–2 appear on your desk, all three on the shelf. Images are resized to 512 px.</p>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-5 p-5">
            <Toggle
              label="Quiet hours"
              hint="Only critical alerts may interrupt you during quiet hours."
              checked={st.quietHours.enabled}
              onChange={(v) => s.updateSettings({ quietHours: { ...st.quietHours, enabled: v } })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quiet from</Label>
                <Input type="time" value={st.quietHours.start} onChange={(e) => s.updateSettings({ quietHours: { ...st.quietHours, start: e.target.value } })} />
              </div>
              <div>
                <Label>Until</Label>
                <Input type="time" value={st.quietHours.end} onChange={(e) => s.updateSettings({ quietHours: { ...st.quietHours, end: e.target.value } })} />
              </div>
            </div>
            <div>
              <Label>Daily AI briefing time (MYT)</Label>
              <Input type="time" className="w-40" value={st.briefingTime} onChange={(e) => s.updateSettings({ briefingTime: e.target.value })} />
              <p className="mt-1 text-[11px] text-slate-500">Saved now; the Executive Assistant&apos;s scheduled briefing runs from Phase 4.</p>
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="p-5">
            <IntegrationsPanel />
          </TabsContent>

          <TabsContent value="data" className="space-y-5 p-5">
            <Toggle
              label="Demo mode"
              hint="Shows clearly labelled SAMPLE business data so you can test dashboards. Never mixed with live data."
              checked={st.demoMode}
              onChange={(v) => s.updateSettings({ demoMode: v })}
            />
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">System status</div>
              <StatusRow label="Database & auth (Supabase)" ok={health?.supabase} okText="Configured" offText="Not configured — data stored in this browser" />
              <StatusRow label="AI engine (server-side)" ok={health?.ai} okText="Key configured" offText="Not configured — add AI_API_KEY" />
              <StatusRow label="Marketplace integrations" ok={false} okText="" offText="0 connected (Phase 3)" />
            </div>
            <AIUsageCard />
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Button variant="outline" size="sm" onClick={exportData}>
                <Download /> Export data (JSON)
              </Button>
              {confirmReset ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      s.resetAll();
                      setConfirmReset(false);
                      toast("success", "All local data reset");
                      setTimeout(() => window.location.reload(), 300);
                    }}
                  >
                    Confirm: erase everything
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" className="text-red-600" onClick={() => setConfirmReset(true)}>
                  <Trash2 /> Reset all data
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// USD per million tokens [input, output] — estimates only; the Anthropic Console is authoritative.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

function AIUsageCard() {
  const tasks = useOffice((s) => s.tasks);
  const chats = useOffice((s) => s.chatMessages);
  const month = new Date().toISOString().slice(0, 7);
  let input = 0;
  let output = 0;
  let cost = 0;
  let runs = 0;
  const add = (u: { input: number; output: number } | null | undefined, model: string | null | undefined, at: string) => {
    if (!u || !at.startsWith(month)) return;
    runs++;
    input += u.input;
    output += u.output;
    const p = PRICES[model ?? ""] ?? PRICES["claude-opus-5-5"];
    cost += (u.input * p[0] + u.output * p[1]) / 1_000_000;
  };
  tasks.forEach((t) => add(t.usage, t.model, t.updatedAt));
  chats.forEach((m) => add(m.usage, m.model, m.createdAt));
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-700">AI usage this month</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-base font-semibold text-slate-900">{runs}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">AI requests</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-base font-semibold text-slate-900">{((input + output) / 1000).toFixed(1)}k</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Tokens</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-base font-semibold text-slate-900">${cost.toFixed(2)}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Est. cost (USD)</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Estimate from requests made in this browser. Your Anthropic Console shows exact billing. To spend less, set an employee&apos;s model to Sonnet or Haiku
        in Edit employee.
      </p>
    </div>
  );
}

function StatusRow({ label, ok, okText, offText }: { label: string; ok?: boolean; okText: string; offText: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-slate-600">{label}</span>
      {ok ? <Badge variant="success">{okText}</Badge> : <Badge variant="secondary">{offText}</Badge>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function ColorSetting({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full cursor-pointer rounded-lg border border-slate-200" />
    </div>
  );
}
