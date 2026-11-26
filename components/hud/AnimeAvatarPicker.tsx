"use client";

import { useRef, useState } from "react";
import { Loader2, Sparkles, Upload } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { getSupabase } from "@/lib/supabase/client";

export const SAMPLE_VRM = "/avatars/sample-anime.vrm";
const MAX = 50 * 1024 * 1024;

async function removeFile(url: string) {
  if (url === SAMPLE_VRM) return;
  await fetch("/api/avatars", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => {});
}

/** Anime 3D avatar (VRM, e.g. made in VRoid Studio) for one employee, or "ceo". Replaces the chibi body in the office. */
export function AnimeAvatarPicker({ vrmKey, name }: { vrmKey: string; name: string }) {
  const current = useOffice((s) => s.settings.vrmAvatars?.[vrmKey]);
  const toast = useUI((s) => s.toast);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const first = name.split(" ")[0] || "them";

  const save = (url: string | null) => {
    const s = useOffice.getState();
    const next = { ...(s.settings.vrmAvatars ?? {}) };
    if (url) next[vrmKey] = url;
    else delete next[vrmKey];
    s.updateSettings({ vrmAvatars: next });
  };
  const replace = async (url: string | null) => {
    if (current && current !== url) await removeFile(current);
    save(url);
  };

  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      if (!/\.vrm$/i.test(f.name)) throw new Error("Pick a .vrm file (VRoid Studio: Export → VRM).");
      if (f.size > MAX) throw new Error("That file is over 50 MB. In VRoid Studio, lower the texture size when exporting.");
      const magic = new TextDecoder().decode(await f.slice(0, 4).arrayBuffer());
      if (magic !== "glTF") throw new Error("That doesn't look like a VRM avatar file.");
      const sb = getSupabase();
      if (!sb) throw new Error("Uploading needs a signed-in workspace. You can still try the sample character.");
      setBusy(true);
      const r = await fetch("/api/avatars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: vrmKey, size: f.size }) });
      const j = (await r.json().catch(() => ({}))) as { path?: string; token?: string; url?: string; error?: string };
      if (!r.ok || !j.path || !j.token || !j.url) throw new Error(j.error ?? "Couldn't prepare the upload");
      const { error } = await sb.storage.from("avatars").uploadToSignedUrl(j.path, j.token, f, { contentType: "model/gltf-binary" });
      if (error) throw new Error(error.message);
      await replace(j.url);
      toast("success", `${first} now uses the anime avatar`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const label = !current ? "Chibi (built-in)" : current === SAMPLE_VRM ? "Sample anime character" : "Uploaded anime avatar";
  const btn = "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50";
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-800">Anime 3D avatar</div>
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`${btn} bg-navy text-white ring-navy hover:bg-navy/90`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {busy ? "Uploading…" : "Upload .vrm"}
        </button>
        {current !== SAMPLE_VRM && (
          <button type="button" disabled={busy} onClick={() => void replace(SAMPLE_VRM)} className={`${btn} bg-panel text-slate-700`}>
            <Sparkles className="h-3.5 w-3.5" /> Try the sample
          </button>
        )}
        {current && (
          <button type="button" disabled={busy} onClick={() => void replace(null)} className={`${btn} bg-panel text-slate-600`}>
            Back to chibi
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Make your own free in{" "}
        <a href="https://vroid.com/en/studio" target="_blank" rel="noreferrer" className="font-semibold text-navy underline dark:text-sky-300">
          VRoid Studio
        </a>{" "}
        (Windows/Mac), then Export → VRM. Use original characters, not ones from shows. Battery graphics shows the chibi instead.
      </p>
      <input
        ref={input}
        type="file"
        accept=".vrm"
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
