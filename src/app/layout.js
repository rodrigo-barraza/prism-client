import { Inter } from "next/font/google";
import { ThemeProvider, ComponentsProvider } from "@rodrigo-barraza/components-library";
import { WorkspaceProvider } from "../components/WorkspaceContextComponent";
import "./globals.css";

// Force all pages to render dynamically — prevents SSG prerender
// failures during Docker builds when Vault/Prism APIs are unreachable
export const dynamic = "force-dynamic";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "Prism Playground",
  description: "Advanced Developer Playground for Prism AI Gateway",
  icons: { icon: "/favicon.ico" },
};

/**
 * Inline blocking script that runs before first paint to set `data-theme`
 * from localStorage, preventing FOUC (Flash of Unstyled Content).
 *
 * React 19 rejects `<script>` tags in components. Using a self-removing
 * `<template>` that promotes its script content on mount — the browser
 * executes it synchronously during parsing, before paint.
 */
const themeInitScript = `
(function(){
  try {
    var raw = localStorage.getItem('prism:theme');
    if (raw) {
      var theme = JSON.parse(raw);
      if (theme === 'light' || theme === 'dark' || theme === 'tropical' || theme === 'oceanic' || theme === 'punk') {
        document.documentElement.setAttribute('data-theme', theme);
      }
    }
    var nav = localStorage.getItem('panel_nav');
    if (nav === 'false') {
      document.documentElement.setAttribute('data-nav-collapsed', 'true');
    }
  } catch(e) { console.warn('Theme initialization failed:', e.message); }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <template
          dangerouslySetInnerHTML={{
            __html: `<script>${themeInitScript}</script>`,
          }}
          suppressHydrationWarning
        />
      </head>
      <body className={inter.variable}>
        <ThemeProvider storageKey="prism:theme" defaultTheme="light">
          <ComponentsProvider sound>
            <WorkspaceProvider>{children}</WorkspaceProvider>
          </ComponentsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
