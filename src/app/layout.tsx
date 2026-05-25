import { Inter, Noto_Color_Emoji, Noto_Emoji } from "next/font/google";
import {
  ThemeProvider,
  ComponentsProvider,
  generateThemeInitScript,
} from "@rodrigo-barraza/components-library";
import { WorkspaceProvider } from "../components/WorkspaceContextComponent";
import CustomThemeBootComponent from "../components/CustomThemeBootComponent";
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
  weight: ["400", "500", "600", "700"],
  subsets: ["emoji"],
  display: "swap",
});

export const metadata = {
  title: "Prism Playground",
  description: "Advanced Developer Playground for Prism AI Gateway",
  icons: { icon: "/favicon.ico" },
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
      document.documentElement.setAttribute('data-nav-collapsed', 'true');
    }
  } catch (error) { console.warn('Nav initialization failed:', error.message); }
})();</script>`,
          }}
          suppressHydrationWarning
        />
      </head>
      <body className={`${inter.variable} ${notoColorEmoji.variable} ${notoEmoji.variable}`}>
        <ThemeProvider storageKey="prism:theme" defaultTheme="light">
          <CustomThemeBootComponent />
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
