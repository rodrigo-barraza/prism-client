import { Inter } from "next/font/google";
import {
  ThemeProvider,
  ComponentsProvider,
  generateThemeInitScript,
} from "@rodrigo-barraza/components-library";
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

export default function RootLayout({ children }: any) {
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
