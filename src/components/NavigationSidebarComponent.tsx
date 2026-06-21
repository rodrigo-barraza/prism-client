"use client";

import { usePathname } from "next/navigation";
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import PrismService from "../services/PrismService";
import WorkspaceService from "../services/WorkspaceService";
import type { PrismSettings } from "../types/types";
import {
  ShieldCheck,
  ChevronsLeft,
  Menu,
  X,
  CircleUser,
  LogOut,
  Settings,
} from "lucide-react";
import {
  USER_NAV_SECTIONS,
  ADMIN_NAV_SECTIONS,
  type NavigationItem,
  type NavigationSection,
} from "../utils/PageIconMap";
import {
  useTheme,
  ThemePickerComponent,
} from "@rodrigo-barraza/components-library";
import SpinningCatComponent from "./SpinningCatComponent";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./NavigationSidebarComponent.module.css";
import NavigationIndicatorComponent from "./NavigationIndicatorComponent";
import { LS_PANEL_NAV, LS_PANEL_LEFT, LS_PANEL_RIGHT, LS_CRON_JOB_NOTIFICATIONS_COUNT, EV_CRON_JOB_SCHEDULED, EV_PRISM_SETTINGS_UPDATED } from "../constants";
import { generateUUID } from "@rodrigo-barraza/utilities-library";
import RainbowCanvasComponent from "./RainbowCanvasComponent";
import SoundService from "@/services/SoundService";
import { CustomThemeService } from "@rodrigo-barraza/components-library";

function RainbowCanvas({
  turbo = false,
  greyscale = false,
}: {
  turbo?: boolean;
  greyscale?: boolean;
}) {
  return (
    <RainbowCanvasComponent
      turbo={turbo}
      greyscale={greyscale}
      className={styles['rainbow-canvas']}
    />
  );
}

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
  const { data: userSession, status: authStatus } = useSession();
  const { theme, themes, setTheme } = useTheme();
  const customThemeMeta = useMemo(
    () => CustomThemeService.getCustomThemeMetaMap(),
    [],
  );
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
  const [settingsWarningCount, setSettingsWarningCount] = useState<number>(0);
  const [cronJobNotificationsCount, setCronJobNotificationsCount] = useState(0);

  const clearCronJobNotifications = useCallback(() => {
    localStorage.setItem(LS_CRON_JOB_NOTIFICATIONS_COUNT, "0");
    setCronJobNotificationsCount(0);
    window.dispatchEvent(new CustomEvent(EV_CRON_JOB_SCHEDULED));
  }, []);

  useEffect(() => {
    const storedCount = parseInt(localStorage.getItem(LS_CRON_JOB_NOTIFICATIONS_COUNT) || "0", 10);
    if (pathname.startsWith("/scheduled-tasks")) {
      if (storedCount > 0) {
        clearCronJobNotifications();
      }
    } else {
      setCronJobNotificationsCount(storedCount);
    }
  }, [pathname, clearCronJobNotifications]);

  useEffect(() => {
    const handleCronJobScheduledEvent = () => {
      const storedCount = parseInt(localStorage.getItem(LS_CRON_JOB_NOTIFICATIONS_COUNT) || "0", 10);
      setCronJobNotificationsCount(storedCount);
    };

    window.addEventListener(EV_CRON_JOB_SCHEDULED, handleCronJobScheduledEvent);
    return () => {
      window.removeEventListener(EV_CRON_JOB_SCHEDULED, handleCronJobScheduledEvent);
    };
  }, []);

  // Fetch settings to determine if action is needed on /settings
  useEffect(() => {
    if (mode !== "user") return;

    const checkWarnings = async (settingsData?: PrismSettings | null) => {
      try {
        const [loadedSettings, workspaceList] = await Promise.all([
          settingsData !== undefined && settingsData !== null
            ? Promise.resolve(settingsData)
            : PrismService.getSettings(),
          WorkspaceService.list().catch(() => []),
        ]);

        if (!loadedSettings) {
          setSettingsWarningCount(0);
          return;
        }

        const memoryConfig = loadedSettings.memory || {};
        const creativeConfig = loadedSettings.creative || {};

        let warningCount = 0;
        if (!memoryConfig.extractionModel) {
          warningCount++;
        }
        if (!memoryConfig.consolidationModel) {
          warningCount++;
        }
        if (!memoryConfig.embeddingModel) {
          warningCount++;
        }
        if (!creativeConfig.imageModel) {
          warningCount++;
        }
        if (!creativeConfig.visionModel) {
          warningCount++;
        }
        if (!creativeConfig.textToSpeechModel) {
          warningCount++;
        }
        if (!creativeConfig.speechToTextModel) {
          warningCount++;
        }

        const hasConnectedWorkspace =
          workspaceList &&
          workspaceList.length > 0 &&
          workspaceList.some((workspace) => workspace.isAgentServed);

        if (!hasConnectedWorkspace) {
          warningCount++;
        }

        setSettingsWarningCount(warningCount);
      } catch (error) {
        // ignore
      }
    };

    checkWarnings();

    const handleSettingsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<PrismSettings>;
      if (customEvent.detail) {
        checkWarnings(customEvent.detail);
      }
    };

    window.addEventListener(EV_PRISM_SETTINGS_UPDATED, handleSettingsUpdated);
    return () => {
      window.removeEventListener(EV_PRISM_SETTINGS_UPDATED, handleSettingsUpdated);
    };
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
      document.documentElement.setAttribute(
        "data-navigation-is-collapsed",
        "true",
      );
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
    setShowNav((previousShowNav) => {
      const next = !previousShowNav;
      localStorage.setItem(LS_PANEL_NAV, String(next));
      globalShowNav = next;
      if (next) {
        document.documentElement.removeAttribute(
          "data-navigation-is-collapsed",
        );
      } else {
        document.documentElement.setAttribute(
          "data-navigation-is-collapsed",
          "true",
        );
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

  const sidebarReference = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const catStateRef = useRef<Map<string, CatState>>(new Map());
  const catElsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const isGenRef = useRef<boolean>(isGenerating);
  const previousIsGeneratingRef = useRef<boolean>(false);
  const miniCatsRef = useRef<MiniCat[]>([]);
  const [miniCats, setMiniCats] = useState<MiniCat[]>([]);

  // Mirror props into refs for RAF access
  useEffect(() => {
    isGenRef.current = isGenerating;
  }, [isGenerating]);
  useEffect(() => {
    miniCatsRef.current = miniCats;
  }, [miniCats]);

  // Add cats when sub-agents spawn, retire cats when sub-agents finish
  useEffect(() => {
    const needed = Math.max(0, (activeApiCount || 0) - 1);
    setMiniCats((previousMiniCats) => {
      const activeCount = previousMiniCats.filter((miniCat: MiniCat) => !miniCat.retired).length;
      if (needed === activeCount) return previousMiniCats;

      if (needed < activeCount) {
        // Retire excess active cats (last ones first)
        let toRetire = activeCount - needed;
        const next = [...previousMiniCats];
        for (let i = next.length - 1; i >= 0 && toRetire > 0; i--) {
          if (!next[i].retired) {
            next[i] = { ...next[i], retired: true };
            toRetire--;
          }
        }
        return next;
      }

      // Spawn new cats
      const next = [...previousMiniCats];
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
        previousIsGeneratingRef.current = isGenRef.current;
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
      if (previousIsGeneratingRef.current && !isGen) {
        for (const [, catState] of catStateRef.current) {
          if (catState.phase !== "fading") {
            catState.phase = "fading";
            catState.fadeStart = now;
          }
        }
      }
      previousIsGeneratingRef.current = isGen;

      const toRemove = [];

      for (const cat of cats) {
        let catState = catStateRef.current.get(cat.id);
        if (!catState) {
          catState = {
            x: bw / 2,
            y: bh / 2,
            vx: cat.initVx,
            vy: cat.initVy,
            accelTime: 0,
            phase: "active",
            fadeStart: null,
          };
          catStateRef.current.set(cat.id, catState);
        }

        const element = catElsRef.current.get(cat.id);
        if (!element) continue;

        // Phase transition: sub-agent finished → start winding down
        if (cat.retired && catState.phase === "active") {
          catState.phase = "windingDown";
        }

        // Bounce helper (specular reflection)
        const hs = cat.size / 2;
        const bounce = () => {
          if (catState.x < hs) {
            catState.x = hs;
            catState.vx = Math.abs(catState.vx);
          } else if (catState.x > bw - hs) {
            catState.x = bw - hs;
            catState.vx = -Math.abs(catState.vx);
          }
          if (catState.y < hs) {
            catState.y = hs;
            catState.vy = Math.abs(catState.vy);
          } else if (catState.y > bh - hs) {
            catState.y = bh - hs;
            catState.vy = -Math.abs(catState.vy);
          }
        };

        // FX helper (SpinningCat-style quadratic ramp)
        const computeFx = () => {
          const sm = 0.2 + 0.08 * catState.accelTime * catState.accelTime;
          const interpolation = Math.min((sm - 0.2) / 4.8, 1);
          return {
            scale: 1 + interpolation * 0.5,
            brightness: 1 + interpolation * 2,
            glowR: interpolation * 12,
            glowO: interpolation * 0.9,
          };
        };

        if (catState.phase === "active") {
          // --- Active: bouncing, FX ramping up ---
          catState.x += catState.vx * dt;
          catState.y += catState.vy * dt;
          catState.accelTime += dt;
          bounce();

          const fx = computeFx();
          element.style.left = `${catState.x}px`;
          element.style.top = `${catState.y}px`;
          element.style.transform = `translate(-50%, -50%) scale(${fx.scale})`;
          element.style.filter = `brightness(${fx.brightness}) drop-shadow(0 0 ${fx.glowR}px rgba(255,255,255,${fx.glowO}))`;
          element.style.opacity = "0.85";
          if (!element.src.endsWith("cat-spinning.gif"))
            element.src = "/cat-spinning.gif";
        } else if (catState.phase === "windingDown") {
          // --- Winding down: decelerating, FX reversing ---
          const smoothing = Math.pow(0.97, dt * 60);
          catState.vx *= smoothing;
          catState.vy *= smoothing;
          catState.x += catState.vx * dt;
          catState.y += catState.vy * dt;
          bounce();

          // Reverse FX (wind down twice as fast as ramp up)
          catState.accelTime = Math.max(0, catState.accelTime - dt * 2);
          const fx = computeFx();
          element.style.left = `${catState.x}px`;
          element.style.top = `${catState.y}px`;
          element.style.transform = `translate(-50%, -50%) scale(${fx.scale})`;
          element.style.filter = `brightness(${fx.brightness}) drop-shadow(0 0 ${fx.glowR}px rgba(255,255,255,${fx.glowO}))`;

          // Stopped → transition to idle, switch to static cat
          if (Math.sqrt(catState.vx * catState.vx + catState.vy * catState.vy) < 2) {
            catState.vx = 0;
            catState.vy = 0;
            catState.phase = "idle";
            element.src = "/cat.gif";
          }
        } else if (catState.phase === "idle") {
          // --- Idle: sitting still, static sprite, waiting ---
          element.style.transform = "translate(-50%, -50%)";
          element.style.filter = "drop-shadow(0 1px 4px rgba(0,0,0,0.45))";
          element.style.opacity = "0.85";
        } else if (catState.phase === "fading") {
          // --- Fading: decelerating + fade/shrink over 3 seconds ---
          const smoothing = Math.pow(0.95, dt * 60);
          catState.vx *= smoothing;
          catState.vy *= smoothing;
          catState.x += catState.vx * dt;
          catState.y += catState.vy * dt;
          bounce();

          // Wind down remaining FX
          catState.accelTime = Math.max(0, catState.accelTime - dt * 3);
          const fx = computeFx();

          const elapsed = (now - (catState.fadeStart ?? now)) / 1000;
          const progress = Math.min(elapsed / 3, 1);
          const opacity = 0.85 * (1 - progress);
          const scale = 1 - progress * 0.3;

          element.style.left = `${catState.x}px`;
          element.style.top = `${catState.y}px`;
          element.style.transform = `translate(-50%, -50%) scale(${scale})`;
          element.style.filter = `brightness(${fx.brightness}) drop-shadow(0 0 ${fx.glowR}px rgba(255,255,255,${fx.glowO}))`;
          element.style.opacity = `${opacity}`;

          // Switch to static cat once slowed enough
          if (
            Math.sqrt(catState.vx * catState.vx + catState.vy * catState.vy) < 2 &&
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
        setMiniCats((previousMiniCats) =>
          previousMiniCats.filter((miniCat: MiniCat) => !removeSet.has(miniCat.id)),
        );
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // -- Programmatic contrast color for sidebar content ------------
  useEffect(() => {
    const sidebarElement = sidebarReference.current;
    if (!sidebarElement) return;

    const computeAndApplyContrastColor = () => {
      const computedStyle = getComputedStyle(sidebarElement);
      const backgroundColorValue = computedStyle.backgroundColor;

      const redGreenBlueMatch = backgroundColorValue.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
      );
      if (!redGreenBlueMatch) return;

      const redChannel = parseInt(redGreenBlueMatch[1], 10);
      const greenChannel = parseInt(redGreenBlueMatch[2], 10);
      const blueChannel = parseInt(redGreenBlueMatch[3], 10);

      const toLinearComponent = (channelValue: number): number => {
        const normalizedValue = channelValue / 255;
        return normalizedValue <= 0.03928
          ? normalizedValue / 12.92
          : Math.pow((normalizedValue + 0.055) / 1.055, 2.4);
      };

      const relativeLuminance =
        0.2126 * toLinearComponent(redChannel) +
        0.7152 * toLinearComponent(greenChannel) +
        0.0722 * toLinearComponent(blueChannel);

      const isLightBackground = relativeLuminance > 0.179;

      sidebarElement.style.setProperty(
        "--sidebar-contrast-color",
        isLightBackground ? "rgba(0, 0, 0, 0.95)" : "rgba(255, 255, 255, 0.98)",
      );
      sidebarElement.style.setProperty(
        "--sidebar-contrast-color-muted",
        isLightBackground ? "rgba(0, 0, 0, 0.68)" : "rgba(255, 255, 255, 0.78)",
      );
      sidebarElement.style.setProperty(
        "--sidebar-contrast-border",
        isLightBackground ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.15)",
      );
      sidebarElement.style.setProperty(
        "--sidebar-contrast-hover-background",
        isLightBackground ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)",
      );
    };

    computeAndApplyContrastColor();

    const mutationObserver = new MutationObserver(computeAndApplyContrastColor);
    mutationObserver.observe(sidebarElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    const documentObserver = new MutationObserver(computeAndApplyContrastColor);
    documentObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      mutationObserver.disconnect();
      documentObserver.disconnect();
    };
  }, []);

  const navSections = mode === "admin" ? ADMIN_NAV_SECTIONS : USER_NAV_SECTIONS;
  const isAdmin = mode === "admin";

  /* -- Mobile: render floating hamburger + compact popover menu -- */
  if (isMobile) {
    return (
      <>
        {/* Floating triangle trigger */}
        <button
          className={styles['mobile-hamburger']}
          onClick={() => setMobileOpen((isOpenState) => !isOpenState)}
          title={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {/* Spinning circle with rainbow ring */}
          <span className={styles['circle-spin']}>
            <span className={styles['triangle-outer']}>
              <RainbowCanvas turbo={isGenerating} greyscale={!isGenerating} />
            </span>
            <span className={styles['triangle-inner']} />
          </span>
          {/* Icon stays centered, doesn't spin */}
          <span className={styles['triangle-icon']}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </span>
        </button>

        {/* Popover card */}
        {mobileOpen && (
          <>
            <div
              className={styles['mobile-backdrop']}
              onClick={() => setMobileOpen(false)}
            />
            <div className={styles['mobile-popover']}>
              {/* Rainbow strip */}
              <div className={styles['rainbow-strip']}>
                <RainbowCanvas turbo={isGenerating} greyscale={!isGenerating} />
                <SpinningCatComponent animate={isGenerating} />
              </div>

              {/* Navigation links */}
              <nav className={styles['mobile-popover-navigation-bar']}>
                {navSections.map(
                  (
                    section: NavigationSection,
                    sectionIndex: number,
                  ) => (
                    <React.Fragment key={section.label || sectionIndex}>
                      {/* Section divider */}
                      {section.label && (
                        <div className={styles['navigation-divider']}>
                          <span>{section.label}</span>
                        </div>
                      )}
                      {section.items.map(
                        (
                          item: NavigationItem,
                        ) => {
                          const Icon = item.icon;
                          const isActive =
                            (item.exact
                              ? pathname === item.href
                              : pathname.startsWith(item.href)) ||
                            item.alsoMatches?.some((pathPattern: string) =>
                              pathname.startsWith(pathPattern),
                            );

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={`${styles['navigation-link']} ${isActive ? styles['is-active-state'] : ""}`}
                              onMouseEnter={(mouseEnterEvent: React.MouseEvent) =>
                                SoundService.playHover({ event: mouseEnterEvent.nativeEvent })
                              }
                              onClick={(clickEvent: React.MouseEvent) => {
                                SoundService.playClick({
                                  event: clickEvent.nativeEvent,
                                });
                                onNavClick?.(item.href);
                                setMobileOpen(false);
                                // Pre-close ThreePanelLayout sidebars so the next page mounts clean
                                localStorage.setItem(LS_PANEL_LEFT, "false");
                                localStorage.setItem(LS_PANEL_RIGHT, "false");
                                if (item.href === "/scheduled-tasks") {
                                  clearCronJobNotifications();
                                }
                              }}
                            >
                              <span className={styles['is-active-state-layer']}>
                                <Icon className={styles['navigation-icon']} />
                                <span className={styles['navigation-label']}>
                                  {item.label}
                                </span>
                                {item.href === "/settings" && (
                                  <NavigationIndicatorComponent
                                    count={settingsWarningCount}
                                    variant="warning"
                                    title={`${settingsWarningCount} setting${settingsWarningCount > 1 ? "s" : ""} need${settingsWarningCount === 1 ? "s" : ""} to be configured`}
                                  />
                                )}
                                {item.href === "/scheduled-tasks" && (
                                  <NavigationIndicatorComponent
                                    count={cronJobNotificationsCount}
                                    variant="notification"
                                    title={`${cronJobNotificationsCount} new scheduled task${cronJobNotificationsCount > 1 ? "s" : ""}`}
                                  />
                                )}
                                {item.showBadge && (
                                  <NavigationIndicatorComponent
                                    count={(badgeCounts as Record<string, number>)[item.showBadge] || 0}
                                    variant="live"
                                  />
                                )}
                              </span>
                            </Link>
                          );
                        },
                      )}
                    </React.Fragment>
                  ),
                )}
              </nav>

              {/* Footer actions */}
              <div className={styles['mobile-popover-footer']}>
                {authStatus === "authenticated" ? (
                  <button
                    className={styles['navigation-link']}
                    onClick={() => {
                      signOut();
                      setMobileOpen(false);
                    }}
                  >
                    <span className={styles['is-active-state-layer']}>
                      <LogOut className={styles['navigation-icon']} />
                      <span className={styles['navigation-label']}>Log Out</span>
                    </span>
                  </button>
                ) : authStatus === "unauthenticated" ? (
                  <button
                    className={styles['navigation-link']}
                    onClick={() => {
                      signIn("google");
                      setMobileOpen(false);
                    }}
                  >
                    <span className={styles['is-active-state-layer']}>
                      <CircleUser className={styles['navigation-icon']} />
                      <span className={styles['navigation-label']}>Log In</span>
                    </span>
                  </button>
                ) : null}
                {isAdmin ? (
                  <Link
                    href="/"
                    className={styles['navigation-link']}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className={styles['is-active-state-layer']}>
                      <ShieldCheck className={styles['navigation-icon']} />
                      <span className={styles['navigation-label']}>
                        User Side
                      </span>
                    </span>
                  </Link>
                ) : isLocal ? (
                  <Link
                    href="/admin"
                    className={styles['navigation-link']}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className={styles['is-active-state-layer']}>
                      <Settings className={styles['navigation-icon']} />
                      <span className={styles['navigation-label']}>Admin Side</span>
                    </span>
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
    <aside
      className={`navigation-sidebar-component ${styles['wrapper']} ${!showNav ? styles['is-collapsed-state'] : ""} ${!navReady ? styles['no-transition'] : ""}`}
    >
      {/* Expanded sidebar */}
      <div ref={sidebarReference} className={styles['sidebar']}>
        {/* Rainbow logo banner */}
        <div className={styles['logo-banner']} ref={bannerRef}>
          <RainbowCanvas turbo={isGenerating} greyscale={!isGenerating} />
          {miniCats.map((cat: MiniCat) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={cat.id}
              ref={(element: HTMLImageElement | null) => {
                if (element) catElsRef.current.set(cat.id, element);
                else catElsRef.current.delete(cat.id);
              }}
              src="/cat-spinning.gif"
              alt=""
              className={styles['mini-cat']}
              style={{ width: `${cat.size}px`, height: `${cat.size}px` }}
            />
          ))}
          <SpinningCatComponent animate={isGenerating} />
          <button
            className={styles['collapse-button']}
            onClick={toggleNav}
            title="Toggle sidebar"
          >
            <ChevronsLeft size={14} />
          </button>
        </div>

        {/* Navigation */}
        <nav className={styles['navigation-list']}>
          {navSections.map(
            (
              section: NavigationSection,
              sectionIndex: number,
            ) => (
              <React.Fragment key={section.label || sectionIndex}>
                {/* Section divider */}
                {section.label && (
                  <div className={styles['navigation-divider']}>
                    <span>{section.label}</span>
                  </div>
                )}
                {section.items.map(
                  (
                    item: NavigationItem,
                  ) => {
                    const Icon = item.icon;
                    const isActive =
                      (item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href)) ||
                      item.alsoMatches?.some((pathPattern: string) =>
                        pathname.startsWith(pathPattern),
                      );

                    const link = (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`${styles['navigation-link']} ${isActive ? styles['is-active-state'] : ""}`}
                        onMouseEnter={(mouseEnterEvent: React.MouseEvent) =>
                          SoundService.playHover({ event: mouseEnterEvent.nativeEvent })
                        }
                        onClick={(clickEvent: React.MouseEvent) => {
                          SoundService.playClick({ event: clickEvent.nativeEvent });
                          onNavClick?.(item.href);
                          if (item.href === "/scheduled-tasks") {
                            clearCronJobNotifications();
                          }
                        }}
                      >
                        <span className={styles['is-active-state-layer']}>
                          <Icon className={styles['navigation-icon']} />
                          <span className={styles['navigation-label']}>
                            {item.label}
                          </span>
                          {item.href === "/settings" && (
                            <NavigationIndicatorComponent
                              count={settingsWarningCount}
                              variant="warning"
                              title={`${settingsWarningCount} setting${settingsWarningCount > 1 ? "s" : ""} need${settingsWarningCount === 1 ? "s" : ""} to be configured`}
                            />
                          )}
                          {item.href === "/scheduled-tasks" && (
                            <NavigationIndicatorComponent
                              count={cronJobNotificationsCount}
                              variant="notification"
                              title={`${cronJobNotificationsCount} new scheduled task${cronJobNotificationsCount > 1 ? "s" : ""}`}
                            />
                          )}
                          {item.showBadge && (
                            <NavigationIndicatorComponent
                              count={(badgeCounts as Record<string, number>)[item.showBadge] || 0}
                              variant="live"
                            />
                          )}
                        </span>
                      </Link>
                    );

                    return (
                      <TooltipComponent
                        key={item.href}
                        label={item.label}
                        position="right"
                        delay={200}
                        disabled={showNav}
                        className={styles['tooltip-fill']}
                      >
                        {link}
                      </TooltipComponent>
                    );
                  },
                )}
              </React.Fragment>
            ),
          )}
        </nav>

        {/* Footer */}
        <div className={styles['footer']}>
          {authStatus === "authenticated" ? (
            <TooltipComponent
              label="Log Out"
              position="right"
              delay={200}
              disabled={showNav}
              className={styles['tooltip-fill']}
            >
              <button
                className={styles['navigation-link']}
                onClick={() => signOut()}
                onMouseEnter={(e) =>
                  SoundService.playHover({ event: e.nativeEvent })
                }
              >
                <span className={styles['is-active-state-layer']}>
                  <LogOut className={styles['navigation-icon']} />
                  <span className={styles['navigation-label']}>Log Out</span>
                </span>
              </button>
            </TooltipComponent>
          ) : authStatus === "unauthenticated" ? (
            <TooltipComponent
              label="Log In"
              position="right"
              delay={200}
              disabled={showNav}
              className={styles['tooltip-fill']}
            >
              <button
                className={styles['navigation-link']}
                onClick={() => signIn("google")}
                onMouseEnter={(e) =>
                  SoundService.playHover({ event: e.nativeEvent })
                }
              >
                <span className={styles['is-active-state-layer']}>
                  <CircleUser className={styles['navigation-icon']} />
                  <span className={styles['navigation-label']}>Log In</span>
                </span>
              </button>
            </TooltipComponent>
          ) : null}
          {isAdmin ? (
            <TooltipComponent
              label="User Side"
              position="right"
              delay={200}
              disabled={showNav}
              className={styles['tooltip-fill']}
            >
              <Link
                href="/"
                className={styles['navigation-link']}
                onMouseEnter={(e: React.MouseEvent) =>
                  SoundService.playHover({ event: e.nativeEvent })
                }
                onClick={(e: React.MouseEvent) =>
                  SoundService.playClick({ event: e.nativeEvent })
                }
              >
                <span className={styles['is-active-state-layer']}>
                  <ShieldCheck className={styles['navigation-icon']} />
                  <span className={styles['navigation-label']}>User Side</span>
                </span>
              </Link>
            </TooltipComponent>
          ) : isLocal ? (
            <TooltipComponent
              label="Admin Side"
              position="right"
              delay={200}
              disabled={showNav}
              className={styles['tooltip-fill']}
            >
              <Link
                href="/admin"
                className={styles['navigation-link']}
                onMouseEnter={(e: React.MouseEvent) =>
                  SoundService.playHover({ event: e.nativeEvent })
                }
                onClick={(e: React.MouseEvent) =>
                  SoundService.playClick({ event: e.nativeEvent })
                }
              >
                <span className={styles['is-active-state-layer']}>
                  <Settings className={styles['navigation-icon']} />
                  <span className={styles['navigation-label']}>Admin Side</span>
                </span>
              </Link>
            </TooltipComponent>
          ) : null}
          {isAdmin && (
            <div className={styles['status-layout-row']}>
              <span
                className={`${styles['status-dot']} ${systemStatus !== "connected" ? styles['offline'] : ""}`}
              />
              <span>
                Prism {systemStatus === "connected" ? "Connected" : "Offline"}
              </span>
            </div>
          )}
          <ThemePickerComponent
            theme={theme}
            themes={themes}
            onSelectTheme={setTheme}
            collapsed={!showNav}
            customThemeMeta={customThemeMeta}
          />
        </div>
      </div>
    </aside>
  );
}
