"use client";

import { useEffect } from "react";
import { useTheme } from "@rodrigo-barraza/components-library";
import CustomThemeService from "../services/CustomThemeService";

/**
 * CustomThemeBootComponent — Injects all custom theme <style> blocks on mount
 * and registers their names with ThemeProvider so they appear in the picker.
 *
 * Place this inside ThemeProvider (in layout.tsx) so it has access to
 * the theme context.
 */
export default function CustomThemeBootComponent() {
  const { addThemes } = useTheme();

  useEffect(() => {
    // Inject all custom theme CSS into <head>
    CustomThemeService.injectAllCustomThemes();

    // Register custom theme names with ThemeProvider
    const customNames = CustomThemeService.getCustomThemeNames();
    if (customNames.length > 0) {
      addThemes(customNames);
    }
  }, [addThemes]);

  return null;
}
