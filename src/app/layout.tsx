import type { Viewport } from "next";
import { Inter, Noto_Color_Emoji, Noto_Emoji } from "next/font/google";
import {
  ThemeProvider,
  CustomThemeBootComponent,
  generateThemeInitScript,
} from "@rodrigo-barraza/components-library";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import PrismSessionGateComponent from "@/components/PrismSessionGateComponent";
import { LOCAL_STORAGE_KEY_PANEL_NAV } from "@/constants";

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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* A plain <script> runs before first paint; one inside a <template>
            is inert and never runs, so non-default themes flashed. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `${generateThemeInitScript("prism:theme")}
(function(){
  try {
    var nav = localStorage.getItem('${LOCAL_STORAGE_KEY_PANEL_NAV}');
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
})();`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${notoColorEmoji.variable} ${notoEmoji.variable}`}
      >
        <SessionProvider>
          <ThemeProvider storageKey="prism:theme" defaultTheme="light">
            <CustomThemeBootComponent storageKey="prism:custom-themes" />
            {/* Profiles, workspaces and the page itself render once the
                signed-in user's Prism token is in hand. */}
            <PrismSessionGateComponent>{children}</PrismSessionGateComponent>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
