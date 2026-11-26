"use client";

import { useOffice } from "@/lib/store/office-store";
import { translate, type Lang } from "./i18n-core";
export { translate, LANGS, type Lang } from "./i18n-core";

/** Current language and a t() for components. */
export function useT() {
  const lang = useOffice((s) => s.settings.language) ?? "en";
  return { lang, t: (text: string) => translate(lang, text) };
}

/** Outside React (e.g. inside a frame loop). */
export const currentLang = (): Lang => useOffice.getState().settings.language ?? "en";
