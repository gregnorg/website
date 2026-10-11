import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shove Actually",
    short_name: "Shove",
    description: "It’s okay to be pushy.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f4",
    theme_color: "#295b45",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
