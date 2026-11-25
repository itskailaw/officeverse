"use client";

import { create } from "zustand";
import { useOffice } from "@/lib/store/office-store";
import { isRaining } from "./weather-rules";
export { isRaining };

/** Live weather for the office's location (Open-Meteo, no key needed), refreshed every 20 minutes. */
export interface Weather {
  code: number;
  temp: number;
  raining: boolean;
  storm: boolean;
  cloudy: boolean;
  at: number;
  place: string;
}

/** Cities to pick from (default: Kuala Lumpur). */
export const PLACES: { name: string; lat: number; lon: number }[] = [
  { name: "Kuala Lumpur", lat: 3.139, lon: 101.6869 },
  { name: "Petaling Jaya", lat: 3.1073, lon: 101.6067 },
  { name: "Shah Alam", lat: 3.0733, lon: 101.5185 },
  { name: "Subang Jaya", lat: 3.0438, lon: 101.5806 },
  { name: "Cyberjaya / Putrajaya", lat: 2.9264, lon: 101.6964 },
  { name: "Klang", lat: 3.0449, lon: 101.4456 },
  { name: "Seremban", lat: 2.7259, lon: 101.9424 },
  { name: "Melaka", lat: 2.1896, lon: 102.2501 },
  { name: "Johor Bahru", lat: 1.4927, lon: 103.7414 },
  { name: "Ipoh", lat: 4.5975, lon: 101.0901 },
  { name: "George Town, Penang", lat: 5.4141, lon: 100.3288 },
  { name: "Kuantan", lat: 3.8077, lon: 103.326 },
  { name: "Kota Bharu", lat: 6.1254, lon: 102.2381 },
  { name: "Kota Kinabalu", lat: 5.9804, lon: 116.0735 },
  { name: "Kuching", lat: 1.5533, lon: 110.3592 },
];

export const useWeather = create<{ w: Weather | null; load(): Promise<void> }>((set) => ({
  w: null,
  async load() {
    const cfg = useOffice.getState().settings.weather;
    if (cfg?.mode === "off") return set({ w: null });
    const lat = cfg?.lat ?? PLACES[0].lat;
    const lon = cfg?.lon ?? PLACES[0].lon;
    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code,precipitation,rain,showers&timezone=Asia%2FKuala_Lumpur`,
        { cache: "no-store" },
      );
      if (!r.ok) return;
      const j = (await r.json()) as { current?: { temperature_2m?: number; weather_code?: number; precipitation?: number; rain?: number; showers?: number } };
      const c = j.current ?? {};
      const code = Number(c.weather_code ?? 0);
      const precip = Math.max(Number(c.precipitation ?? 0), Number(c.rain ?? 0) + Number(c.showers ?? 0));
      const raining = isRaining(code, precip);
      set({
        w: { code, temp: Math.round(Number(c.temperature_2m ?? 0)), raining, storm: code >= 95, cloudy: raining || code === 3 || (code >= 45 && code <= 48), at: Date.now(), place: cfg?.place ?? PLACES[0].name },
      });
    } catch {}
  },
}));

export const weatherIcon = (w: Weather) => (w.storm ? "⛈️" : w.raining ? "🌧️" : w.cloudy ? "☁️" : w.code <= 1 ? "☀️" : "⛅");
