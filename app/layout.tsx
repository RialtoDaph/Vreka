import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Rajdhani, JetBrains_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

// Runs before first paint (a plain <script>, not a React effect -- effects
// only run after hydration, too late to avoid a dark->light flash) so
// <html data-theme> is already correct by the time CSS applies. Mirrors
// ThemeProvider's own resolution: an explicit stored "light"/"dark" wins,
// anything else (unset, "system") falls through to the OS preference.
const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("vreka-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rajdhani",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Vreka",
  description: "Personal command center — keuangan, kerjaan, pelajaran.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Vreka" },
};

export const viewport: Viewport = {
  // Best-effort fallback that tracks OS preference (a static <meta> tag
  // can't read localStorage) -- ThemeProvider additionally updates this
  // tag live on mount/toggle so an explicit in-app choice is also reflected.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f7" },
    { media: "(prefers-color-scheme: dark)", color: "#05080d" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${chakra.variable} ${rajdhani.variable} ${jetbrains.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="bg-void text-fg-secondary font-body min-h-screen">
        <ThemeProvider>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
