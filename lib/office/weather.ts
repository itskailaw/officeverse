"use client";

import { create } from "zustand";

/** Live Kuala Lumpur weather (Open-Meteo, no key needed), refreshed every 20 minutes. */
export interface Weather {
  code: number;
  temp: number;
  raining: boolean;
  storm: boolean;
  cloudy: boolean;
  at: number;
}
export const useWeather = create<{ w: Weather | null; load(): Promise<void> }>((set) => ({
  w: null,
  async load() {
    try {
      const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=3.139&longitude=101.6869&current=temperature_2m,weather_code,precipitation&timezone=Asia%2FKuala_Lumpur", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { current?: { temperature_2m?: number; weather_code?: number; precipitation?: number } };
      const code = Number(j.current?.weather_code ?? 0);
      // WMO codes: 51-67 drizzle/rain, 80-82 showers, 95-99 thunderstorm; 2-3 / 45-48 clouds & fog
      const raining = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 || Number(j.current?.precipitation ?? 0) > 0.2;
      set({ w: { code, temp: Math.round(Number(j.current?.temperature_2m ?? 0)), raining, storm: code >= 95, cloudy: raining || code === 3 || (code >= 45 && code <= 48), at: Date.now() } });
    } catch {}
  },
}));

export const weatherIcon = (w: Weather) => (w.storm ? "⛈️" : w.raining ? "🌧️" : w.cloudy ? "☁️" : w.code <= 1 ? "☀️" : "⛅");
