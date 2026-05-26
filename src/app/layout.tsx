import type { Viewport } from "next";
import { Inter, Noto_Color_Emoji, Noto_Emoji } from "next/font/google";
import {
  ThemeProvider,
  ComponentsProvider,
  CustomThemeBootComponent,
  generateThemeInitScript,
} from "@rodrigo-barraza/components-library";
import { WorkspaceProvider } from "../components/WorkspaceContextComponent";
import "./globals.css";
import SessionTrackerComponent from "@/components/SessionTrackerComponent";

// Force all pages to render dynamically — prevents SSG prerender
// failures during Docker builds when Vault/Prism APIs are unreachable
export const dynamic = "force-dynamic";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const notoColorEmoji = Noto_Color_Emoji({
  variable: "--font-emoji",
  weight: "400",
  subsets: ["emoji"],
  display: "swap",
});

const notoEmoji = Noto_Emoji({
  variable: "--font-emoji-mono",
  weight: "variable",
  subsets: ["emoji"],
  display: "swap",
});

export const metadata = {
  title: "Prism Playground",
  description: "Advanced Developer Playground for Prism AI Gateway",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <template
          dangerouslySetInnerHTML={{
            __html: `<script>${generateThemeInitScript("prism:theme")}
(function(){
  try {
    var nav = localStorage.getItem('panel_nav');
    if (nav === 'false') {
      document.documentElement.setAttribute('data-navigation-is-collapsed', 'true');
    }
  } catch (error) { console.warn('Nav initialization failed:', error.message); }
})();
(function(){
  if (!window.visualViewport) return;
  var root = document.documentElement;
  function syncViewportHeight() {
    root.style.setProperty('--visual-viewport-height', window.visualViewport.height + 'px');
  }
  syncViewportHeight();
  window.visualViewport.addEventListener('resize', syncViewportHeight);
})();</script>`,
          }}
          suppressHydrationWarning
        />
      </head>
      <body className={`${inter.variable} ${notoColorEmoji.variable} ${notoEmoji.variable}`}>
        <ThemeProvider storageKey="prism:theme" defaultTheme="light">
          <CustomThemeBootComponent storageKey="prism:custom-themes" />
          <ComponentsProvider sound>
            <WorkspaceProvider>
              {children}
              <SessionTrackerComponent />
            </WorkspaceProvider>
          </ComponentsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
