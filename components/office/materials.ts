"use client";

import * as THREE from "three";

// Shared material cache — avoids creating hundreds of identical materials.
const cache = new Map<string, THREE.Material>();

export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; ei?: number; opacity?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.7}|${opts.metal ?? 0}|${opts.emissive ?? ""}|${opts.ei ?? 0}|${opts.opacity ?? 1}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.7,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.ei ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      depthWrite: (opts.opacity ?? 1) >= 1,
    });
    cache.set(key, m);
  }
  return m;
}

export const PALETTE = {
  navy: "#1e3a5f",
  navyDark: "#13263f",
  white: "#f8fafc",
  grey: "#e2e8f0",
  midGrey: "#94a3b8",
  darkGrey: "#334155",
  wood: "#b07d4f",
  woodDark: "#7a5232",
  woodLight: "#d4a373",
  screen: "#0b1220",
  glass: "#bfdbfe",
  metal: "#cbd5e1",
  leaf: "#3f8f4f",
  leafDark: "#2f6f3c",
  pot: "#e7e5e4",
};

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

const texCache = new Map<string, THREE.Texture>();

function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function plankTexture(base: string) {
  const key = `plank|${base}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const [c, g] = canvas(256, 256);
  const col = new THREE.Color(base);
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * 96;
    for (let k = -1; k < 3; k++) {
      const shade = 0.88 + Math.random() * 0.2;
      g.fillStyle = `rgb(${(col.r * 255 * shade) | 0},${(col.g * 255 * shade) | 0},${(col.b * 255 * shade) | 0})`;
      g.fillRect(off + k * 128, row * 32, 128, 32);
      g.strokeStyle = "rgba(0,0,0,0.18)";
      g.lineWidth = 1.5;
      g.strokeRect(off + k * 128, row * 32, 128, 32);
    }
  }
  // grain
  g.globalAlpha = 0.07;
  for (let i = 0; i < 220; i++) {
    g.strokeStyle = Math.random() > 0.5 ? "#000" : "#fff";
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + 3, 160, y - 3, 256, y);
    g.stroke();
  }
  const t = finish(c);
  texCache.set(key, t);
  return t;
}

export function carpetTexture(base: string) {
  const key = `carpet|${base}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const [c, g] = canvas(128, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  const img = g.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = finish(c);
  texCache.set(key, t);
  return t;
}

export function tileTexture(base: string, line = "rgba(100,116,139,0.25)") {
  const key = `tile|${base}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const [c, g] = canvas(128, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = line;
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  const t = finish(c);
  texCache.set(key, t);
  return t;
}

export function makeScreenTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 1024, h = 576) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
