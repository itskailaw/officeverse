import type { MetadataRoute } from "next";

/** Lets OfficeVerse be installed on the home screen / desktop as an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OfficeVerse",
    short_name: "OfficeVerse",
    description: "Your business, your people, your universe — the virtual HQ for your companies.",
    start_url: "/office",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0f1f36",
    theme_color: "#1e3a5f",
    icons: [
      { src: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
