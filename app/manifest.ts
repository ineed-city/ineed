import type { MetadataRoute } from "next";

// Face aplicația instalabilă pe ecranul telefonului (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iNeed",
    short_name: "iNeed",
    description: "Your everyday helper: useful answers, sourced options and a clear next step.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#f7f8fa",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
