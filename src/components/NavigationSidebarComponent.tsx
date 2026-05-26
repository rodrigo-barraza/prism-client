"use client";

import { usePathname } from "next/navigation";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import PrismService from "../services/PrismService";
import {
  LayoutDashboard,
  ScrollText,
  MessageSquare,
  ArrowLeft,
  Server,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Type,
  Workflow,
  Settings,
  ChevronsLeft,
  Menu,
  X,
  FolderOpen,
  FlaskConical,
  Target,
  Bot,
  MemoryStick,
  Wrench,
  BarChart3,
  AlertCircle,
  Eye,
  Clock,
} from "lucide-react";
import {
  useTheme,
  ThemePickerComponent,
} from "@rodrigo-barraza/components-library";
import SpinningCatComponent from "./SpinningCatComponent";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./NavigationSidebarComponent.module.css";
import { LS_PANEL_NAV, LS_PANEL_LEFT, LS_PANEL_RIGHT } from "../constants";
import { generateUUID } from "../utils/utilities";

import RainbowCanvasComponent from "./RainbowCanvasComponent";
import SoundService from "@/services/SoundService";
import { CustomThemeService } from "@rodrigo-barraza/components-library";

function RainbowCanvas({ turbo = false, greyscale = false }: { turbo?: boolean; greyscale?: boolean; }) {
  return (
    <RainbowCanvasComponent
      turbo={turbo}
      greyscale={greyscale}
      className={styles.rainbowCanvas}
    />
  );
}

const USER_NAV_SECTIONS = [
  {
    label: "Workspace",
    items: [
      {
        href: "/chat",
        label: "Chat",
        icon: Bot,
        alsoMatches: ["/coding-agent", "/agents"],
      },
      {
        href: "/scheduled-tasks",
        label: "Scheduled Tasks",
        icon: Clock,
      },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Information",
    items: [
      { href: "/models", label: "Models", icon: Server },
      { href: "/tools", label: "Tools", icon: Wrench },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/media", label: "Media", icon: ImageIcon },
      { href: "/text", label: "Text", icon: Type },
      { href: "/vision", label: "Vision", icon: Eye },
    ],
  },
  {
    label: "Experiments",
    items: [
      { href: "/benchmarks", label: "Benchmarks", icon: Target },
      { href: "/vram-benchmark", label: "VRAM Bench", icon: MemoryStick },
      { href: "/synthesis", label: "Synthesis", icon: FlaskConical },
      { href: "/workflows", label: "Workflows", icon: Workflow },
    ],
  },
];

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  {
    href: "/admin/requests",
    label: "Requests",
    icon: ScrollText,
    showBadge: "requests",
  },
  { href: "/admin/tool-requests", label: "Tool Requests", icon: Wrench },
  { href: "/admin/tool-calls", label: "Tool Calls", icon: BarChart3 },
  {
    href: "/admin/chat",
    label: "Chat",
    icon: MessageSquare,
    showBadge: "conversations",
  },
  {
    href: "/admin/traces",
    label: "Traces",
    icon: FolderOpen,
    showBadge: "traces",
  },
  { href: "/admin/providers", label: "Providers", icon: Layers },
  { href: "/admin/media", label: "Media", icon: ImageIcon, showBadge: "media" },
  { href: "/admin/text", label: "Text", icon: Type, showBadge: "text" },
  { href: "/admin/models", label: "Models", icon: Server },
];

const ADMIN_NAV_SECTIONS = [
  {
    label: null,
    items: ADMIN_NAV_ITEMS,
  },
  {
    label: "Experiments",
    items: [
      { href: "/admin/synthesis", label: "Synthesis", icon: FlaskConical },
      { href: "/admin/workflows", label: "Workflows", icon: GitBranch },
    ],
  },
];

interface NavigationProps {
  mode?: "user" | "admin";
  liveCount?: number;
  tracesCount?: number;
  requestsCount?: number;
  mediaCount?: number;
  textCount?: number;
  systemStatus?: string;
  isGenerating?: boolean;
  activeApiCount?: number;
  onNavClick?: (href: string) => void;
}

// Module-level cache to persist the sidebar open/collapsed state across client-side page transitions.
// This prevents layout flickering on mount during client-side navigation.
let globalShowNav: boolean | null = null;

export default function NavigationSidebarComponent({
  mode = "user",
  liveCount = 0,
  tracesCount = 0,
  requestsCount = 0,
  mediaCount = 0,
  textCount = 0,
  systemStatus = "connected",
  isGenerating = false,
  activeApiCount = 0,
  onNavClick,
}: NavigationProps) {
  const badgeCounts = {
    conversations: liveCount,
    traces: tracesCount,
    requests: requestsCount,
    media: mediaCount,
    text: textCount,
  };
  const pathname = usePathname();
  const { theme, themes, setTheme } = useTheme();
  const customThemeMeta = useMemo(() => CustomThemeService.getCustomThemeMetaMap(), []);
  const [showNav, setShowNav] = useState(() => {
    if (globalShowNav !== null) {
      return globalShowNav;
    }
    return false;
  });
  const [navReady, setNavReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLocal, setIsLocal] = useState(false);
  const [memoryConfigured, setMemoryConfigured] = useState(true);

  // Fetch memory settings to determine if action is needed on /settings
  useEffect(() => {
    if (mode !== "user") return;
    PrismService.getSettings()
      .then((s) => {
        const memoryData = (s?.memory || {}) as Record<string, string>;
        setMemoryConfigured(
          Boolean(
            memoryData.extractionProvider &&
            memoryData.extractionModel &&
            memoryData.consolidationProvider &&
            memoryData.consolidationModel &&
            memoryData.embeddingProvider &&
            memoryData.embeddingModel,
          ),
        );
      })
      .catch(() => {});
  }, [mode]);

  useEffect(() => {
    // Resolve on client only — prevents SSR hydration flash of admin link
    setIsLocal(!window.location.hostname.endsWith(".com"));
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(LS_PANEL_NAV);
    const initialNav = stored !== null ? stored === "true" : false;
    
    setShowNav((current) => {
      if (current !== initialNav) {
        return initialNav;
      }
      return current;
    });
    globalShowNav = initialNav;

    if (!initialNav) {
      document.documentElement.setAttribute("data-navigation-is-collapsed", "true");
    } else {
      document.documentElement.removeAttribute("data-navigation-is-collapsed");
    }

    // Enable transitions after first paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setNavReady(true));
    });
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 1200);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggleNav = useCallback(() => {
    setShowNav((prev) => {
      const next = !prev;
      localStorage.setItem(LS_PANEL_NAV, String(next));
      globalShowNav = next;
      if (next) {
        document.documentElement.removeAttribute("data-navigation-is-collapsed");
      } else {
        document.documentElement.setAttribute("data-navigation-is-collapsed", "true");
      }
      return next;
    });
  }, []);

  // -- Bouncing mini cats for concurrent API calls ----------------
  // Lifecycle: active → windingDown → idle → fading → removed
  interface MiniCat {
  id: string;
  size: number;
  initVx: number;
  initVy: number;
  retired: boolean;
}

interface CatState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  accelTime: number;
  phase: string;
  fadeStart: number | null;
}

  const bannerRef = useRef<HTMLDivElement>(null);
  const catStateRef = useRef<Map<string, CatState>>(new Map());
  const catElsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const isGenRef = useRef<boolean>(isGenerating);
  const prevIsGenRef = useRef<boolean>(false);
  const miniCatsRef = useRef<MiniCat[]>([]);
  const [miniCats, setMiniCats] = useState<MiniCat[]>([]);

  // Mirror props into refs for RAF access
  useEffect(() => {
    isGenRef.current = isGenerating;
  }, [isGenerating]);
  useEffect(() => {
    miniCatsRef.current = miniCats;
  }, [miniCats]);

  // Add cats when workers spawn, retire cats when workers finish
  useEffect(() => {
    const needed = Math.max(0, (activeApiCount || 0) - 1);
    setMiniCats((prev) => {
      const activeCount = prev.filter((c: MiniCat) => !c.retired).length;
      if (needed === activeCount) return prev;

      if (needed < activeCount) {
        // Retire excess active cats (last ones first)
        let toRetire = activeCount - needed;
        const next = [...prev];
        for (let i = next.length - 1; i >= 0 && toRetire > 0; i--) {
          if (!(next[i] as any).retired) {
            next[i] = { ...(next[i] as any), retired: true };
            toRetire--;
          }
        }
        return next;
      }

      // Spawn new cats
      const next = [...prev];
      const toAdd = needed - activeCount;
      for (let j = 0; j < toAdd; j++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 40;
        next.push({
          id: generateUUID(),
          size: 45 + Math.floor(Math.random() * 22),
          initVx: Math.cos(angle) * speed,
          initVy: Math.sin(angle) * speed,
          retired: false,
        });
      }
      return next;
    });
  }, [activeApiCount]);

  // Always-on RAF: movement, bouncing, FX, lifecycle phases
  useEffect(() => {
    let lastTime = 0;
    let rafId: number;

    const tick = (now: number) => {
      const cats = miniCatsRef.current;
      if (cats.length === 0) {
        lastTime = 0;
        prevIsGenRef.current = isGenRef.current;
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (!lastTime) {
        lastTime = now;
        rafId = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const banner = bannerRef.current;
      if (!banner) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const bw = banner.offsetWidth;
      const bh = banner.offsetHeight;
      const isGen = isGenRef.current;

      // Detect primary cat stop: isGenerating true → false → fade ALL cats
      if (prevIsGenRef.current && !isGen) {
        for (const [, p] of catStateRef.current) {
          if (p.phase !== "fading") {
            p.phase = "fading";
            p.fadeStart = now;
          }
        }
      }
      prevIsGenRef.current = isGen;

      const toRemove = [];

      for (const cat of cats) {
        let p = catStateRef.current.get(cat.id);
        if (!p) {
          p = {
            x: bw / 2,
            y: bh / 2,
            vx: cat.initVx,
            vy: cat.initVy,
            accelTime: 0,
            phase: "active",
            fadeStart: null,
          };
          catStateRef.current.set(cat.id, p);
        }

        const element = catElsRef.current.get(cat.id);
        if (!element) continue;

        // Phase transition: worker finished → start winding down
        if (cat.retired && p.phase === "active") {
          p.phase = "windingDown";
        }

        // Bounce helper (specular reflection)
        const hs = cat.size / 2;
        const bounce = () => {
          if (p.x < hs) {
            p.x = hs;
            p.vx = Math.abs(p.vx);
          } else if (p.x > bw - hs) {
            p.x = bw - hs;
            p.vx = -Math.abs(p.vx);
          }
          if (p.y < hs) {
            p.y = hs;
            p.vy = Math.abs(p.vy);
          } else if (p.y > bh - hs) {
            p.y = bh - hs;
            p.vy = -Math.abs(p.vy);
          }
        };

        // FX helper (SpinningCat-style quadratic ramp)
        const computeFx = () => {
          const sm = 0.2 + 0.08 * p.accelTime * p.accelTime;
          const t = Math.min((sm - 0.2) / 4.8, 1);
          return {
            scale: 1 + t * 0.5,
            brightness: 1 + t * 2,
            glowR: t * 12,
            glowO: t * 0.9,
          };
        };

        if (p.phase === "active") {
          // --- Active: bouncing, FX ramping up ---
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.accelTime += dt;
          bounce();

          const fx = computeFx();
          element.style.left = `${p.x}px`;
          element.style.top = `${p.y}px`;
          element.style.transform = `translate(-50%, -50%) scale(${fx.scale})`;
          element.style.filter = `brightness(${fx.brightness}) drop-shadow(0 0 ${fx.glowR}px rgba(255,255,255,${fx.glowO}))`;
          element.style.opacity = "0.85";
          if (!element.src.endsWith("cat-spinning.gif"))
            element.src = "/cat-spinning.gif";
        } else if (p.phase === "windingDown") {
          // --- Winding down: decelerating, FX reversing ---
          const smoothing = Math.pow(0.97, dt * 60);
          p.vx *= smoothing;
          p.vy *= smoothing;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          bounce();

          // Reverse FX (wind down twice as fast as ramp up)
          p.accelTime = Math.max(0, p.accelTime - dt * 2);
          const fx = computeFx();
          element.style.left = `${p.x}px`;
          element.style.top = `${p.y}px`;
          element.style.transform = `translate(-50%, -50%) scale(${fx.scale})`;
          element.style.filter = `brightness(${fx.brightness}) drop-shadow(0 0 ${fx.glowR}px rgba(255,255,255,${fx.glowO}))`;

          // Stopped → transition to idle, switch to static cat
          if (Math.sqrt(p.vx * p.vx + p.vy * p.vy) < 2) {
            p.vx = 0;
            p.vy = 0;
            p.phase = "idle";
            element.src = "/cat.gif";
          }
        } else if (p.phase === "idle") {
          // --- Idle: sitting still, static sprite, waiting ---
          element.style.transform = "translate(-50%, -50%)";
          element.style.filter = "drop-shadow(0 1px 4px rgba(0,0,0,0.45))";
          element.style.opacity = "0.85";
        } else if (p.phase === "fading") {
          // --- Fading: decelerating + fade/shrink over 3 seconds ---
          const smoothing = Math.pow(0.95, dt * 60);
          p.vx *= smoothing;
          p.vy *= smoothing;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          bounce();

          // Wind down remaining FX
          p.accelTime = Math.max(0, p.accelTime - dt * 3);
          const fx = computeFx();

          const elapsed = (now - (p.fadeStart ?? now)) / 1000;
          const progress = Math.min(elapsed / 3, 1);
          const opacity = 0.85 * (1 - progress);
          const scale = 1 - progress * 0.3;

          element.style.left = `${p.x}px`;
          element.style.top = `${p.y}px`;
          element.style.transform = `translate(-50%, -50%) scale(${scale})`;
          element.style.filter = `brightness(${fx.brightness}) drop-shadow(0 0 ${fx.glowR}px rgba(255,255,255,${fx.glowO}))`;
          element.style.opacity = `${opacity}`;

          // Switch to static cat once slowed enough
          if (
            Math.sqrt(p.vx * p.vx + p.vy * p.vy) < 2 &&
            element.src.endsWith("cat-spinning.gif")
          ) {
            element.src = "/cat.gif";
          }

          if (progress >= 1) toRemove.push(cat.id);
        }
      }

      // Clean up fully faded cats
      if (toRemove.length > 0) {
        const removeSet = new Set(toRemove);
        for (const id of removeSet) {
          catStateRef.current.delete(id);
          catElsRef.current.delete(id);
        }
        setMiniCats((prev) =>
          prev.filter((c: MiniCat) => !removeSet.has(c.id)),
        );
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const navSections = mode === "admin" ? ADMIN_NAV_SECTIONS : USER_NAV_SECTIONS;
  const isAdmin = mode === "admin";

  /* -- Mobile: render floating hamburger + compact popover menu -- */
  if (isMobile) {
    return (
      <>
        {/* Floating triangle trigger */}
        <button
          className={styles.mobileHamburger}
          onClick={() => setMobileOpen((v) => !v)}
          title={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {/* Spinning circle with rainbow ring */}
          <span className={styles.circleSpin}>
            <span className={styles.triangleOuter}>
              <RainbowCanvas turbo={isGenerating} greyscale={!isGenerating} />
            </span>
            <span className={styles.triangleInner} />
          </span>
          {/* Icon stays centered, doesn't spin */}
          <span className={styles.triangleIcon}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </span>
        </button>

        {/* Popover card */}
        {mobileOpen && (
          <>
            <div
              className={styles.mobileBackdrop}
              onClick={() => setMobileOpen(false)}
            />
            <div className={styles.mobilePopover}>
              {/* Rainbow strip */}
              <div className={styles.rainbowStrip}>
                <RainbowCanvas turbo={isGenerating} greyscale={!isGenerating} />
                <SpinningCatComponent animate={isGenerating} />
              </div>

              {/* Navigation links */}
              <nav className={styles.mobilePopoverNav}>
                {navSections.map((section: { label: string | null, items: any[] }, sectionIdx: number) => (
                  <React.Fragment key={section.label || sectionIdx}>
                    {/* Section divider */}
                    {section.label && (
                      <div className={styles.navigationDivider}>
                        <span>{section.label}</span>
                      </div>
                    )}
                    {section.items.map((item: typeof USER_NAV_SECTIONS[0]['items'][0] & { exact?: boolean, alsoMatches?: string[], showBadge?: string }) => {
                      const Icon = item.icon;
                      const isActive =
                        (item.exact
                          ? pathname === item.href
                          : pathname.startsWith(item.href)) ||
                        item.alsoMatches?.some((p: string) =>
                          pathname.startsWith(p),
                        );

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`${styles.navigationLink} ${isActive ? styles.isActiveState : ""}`}
                          onMouseEnter={(e: React.MouseEvent) =>
                            SoundService.playHover({ event: e.nativeEvent })
                          }
                          onClick={(e: React.MouseEvent) => {
                            SoundService.playClick({ event: e.nativeEvent });
                            onNavClick?.(item.href);
                            setMobileOpen(false);
                            // Pre-close ThreePanelLayout sidebars so the next page mounts clean
                            localStorage.setItem(LS_PANEL_LEFT, "false");
                            localStorage.setItem(LS_PANEL_RIGHT, "false");
                          }}
                        >
                          <Icon className={styles.navigationIcon} />
                          <span className={styles.navigationLabel}>{item.label}</span>
                          {item.href === "/settings" && !memoryConfigured && (
                            <span
                              className={styles.attentionDot}
                              title="Memory models need to be configured"
                            >
                              <AlertCircle size={13} />
                            </span>
                          )}
                          {item.showBadge &&
                            (badgeCounts as Record<string, number>)[item.showBadge] > 0 && (
                              <span
                                className={`${styles.badge} ${styles.live}`}
                              >
                                {(badgeCounts as Record<string, number>)[item.showBadge]}
                              </span>
                            )}
                        </Link>
                      );
                    })}
                  </React.Fragment>
                ))}
              </nav>

              {/* Footer actions */}
              <div className={styles.mobilePopoverFooter}>
                {isAdmin ? (
                  <Link
                    href="/"
                    className={styles.navigationLink}
                    onClick={() => setMobileOpen(false)}
                  >
                    <ArrowLeft className={styles.navigationIcon} />
                    <span className={styles.navigationLabel}>Back to Prism</span>
                  </Link>
                ) : isLocal ? (
                  <Link
                    href="/admin"
                    className={styles.navigationLink}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Settings className={styles.navigationIcon} />
                    <span className={styles.navigationLabel}>Admin</span>
                  </Link>
                ) : null}
                <ThemePickerComponent
                  theme={theme}
                  themes={themes}
                  onSelectTheme={setTheme}
                  customThemeMeta={customThemeMeta}
                />
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  /* -- Desktop: standard collapsible sidebar -- */

  return (
    <div
      className={`${styles.wrapper} ${!showNav ? styles.isCollapsedState : ""} ${!navReady ? styles.noTransition : ""}`}
    >
      {/* Expanded sidebar */}
      <aside className={styles.sidebar}>
        {/* Rainbow logo banner */}
        <div className={styles.logoBanner} ref={bannerRef}>
          <RainbowCanvas turbo={isGenerating} greyscale={!isGenerating} />
          {miniCats.map((cat: any) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={cat.id}
              ref={(element: HTMLImageElement | null) => {
                if (element) catElsRef.current.set(cat.id, element);
                else catElsRef.current.delete(cat.id);
              }}
              src="/cat-spinning.gif"
              alt=""
              className={styles.miniCat}
              style={{ width: `${cat.size}px`, height: `${cat.size}px` }}
            />
          ))}
          <SpinningCatComponent animate={isGenerating} />
          <button
            className={styles.collapseButton}
            onClick={toggleNav}
            title="Toggle sidebar"
          >
            <ChevronsLeft size={14} />
          </button>
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          {navSections.map((section: { label: string | null, items: any[] }, sectionIdx: number) => (
            <React.Fragment key={section.label || sectionIdx}>
              {/* Section divider */}
              {section.label && (
                <div className={styles.navigationDivider}>
                  <span>{section.label}</span>
                </div>
              )}
              {section.items.map((item: typeof USER_NAV_SECTIONS[0]['items'][0] & { exact?: boolean, alsoMatches?: string[], showBadge?: string }) => {
                const Icon = item.icon;
                const isActive =
                  (item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href)) ||
                  item.alsoMatches?.some((p: string) => pathname.startsWith(p));

                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navigationLink} ${isActive ? styles.isActiveState : ""}`}
                    onMouseEnter={(e: React.MouseEvent) =>
                      SoundService.playHover({ event: e.nativeEvent })
                    }
                    onClick={(e: React.MouseEvent) => {
                      SoundService.playClick({ event: e.nativeEvent });
                      onNavClick?.(item.href);
                    }}
                  >
                    <Icon className={styles.navigationIcon} />
                    <span className={styles.navigationLabel}>{item.label}</span>
                    {item.href === "/settings" && !memoryConfigured && (
                      <span
                        className={styles.attentionDot}
                        title="Memory models need to be configured"
                      >
                        <AlertCircle size={13} />
                      </span>
                    )}
                    {item.showBadge &&
                      (badgeCounts as Record<string, number>)[item.showBadge] > 0 && (
                        <span className={`${styles.badge} ${styles.live}`}>
                          {(badgeCounts as Record<string, number>)[item.showBadge]}
                        </span>
                      )}
                  </Link>
                );

                return (
                  <TooltipComponent
                    key={item.href}
                    label={item.label}
                    position="right"
                    delay={200}
                    disabled={showNav}
                    className={styles.tooltipFill}
                  >
                    {link}
                  </TooltipComponent>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        {/* Footer */}
        <div className={styles.footer}>
          {isAdmin ? (
            <TooltipComponent
              label="Back to Prism"
              position="right"
              delay={200}
              disabled={showNav}
              className={styles.tooltipFill}
            >
              <Link
                href="/"
                className={styles.navigationLink}
                onMouseEnter={(e: React.MouseEvent) => SoundService.playHover({ event: e.nativeEvent })}
                onClick={(e: React.MouseEvent) => SoundService.playClick({ event: e.nativeEvent })}
              >
                <ArrowLeft className={styles.navigationIcon} />
                <span className={styles.navigationLabel}>Back to Prism</span>
              </Link>
            </TooltipComponent>
          ) : isLocal ? (
            <TooltipComponent
              label="Admin"
              position="right"
              delay={200}
              disabled={showNav}
              className={styles.tooltipFill}
            >
              <Link
                href="/admin"
                className={styles.navigationLink}
                onMouseEnter={(e: React.MouseEvent) => SoundService.playHover({ event: e.nativeEvent })}
                onClick={(e: React.MouseEvent) => SoundService.playClick({ event: e.nativeEvent })}
              >
                <Settings className={styles.navigationIcon} />
                <span className={styles.navigationLabel}>Admin</span>
              </Link>
            </TooltipComponent>
          ) : null}
          <ThemePickerComponent
            theme={theme}
            themes={themes}
            onSelectTheme={setTheme}
            collapsed={!showNav}
            customThemeMeta={customThemeMeta}
          />
          {isAdmin && (
            <div className={styles.statusRow}>
              <span
                className={`${styles.statusDot} ${systemStatus !== "connected" ? styles.offline : ""}`}
              />
              <span>
                Prism {systemStatus === "connected" ? "Connected" : "Offline"}
              </span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
