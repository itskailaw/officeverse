"use client";

import { useEffect, useState } from "react";

/** Tablets and phones (touch screen, or a narrow window): larger buttons and a bottom tab bar. */
export function useTouchLayout() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(coarse.matches || window.innerWidth < 1024);
    update();
    coarse.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      coarse.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return touch;
}
