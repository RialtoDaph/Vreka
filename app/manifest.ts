import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vreka",
    short_name: "Vreka",
    description: "Personal command center — keuangan, kerjaan, pelajaran.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#05080d",
    theme_color: "#05080d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
