import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { USER_NAV_SECTIONS, ADMIN_NAV_SECTIONS } from "../PageIconMap";

const APP_DIRECTORY = resolve(__dirname, "../../app");

const navigationItems = [...USER_NAV_SECTIONS, ...ADMIN_NAV_SECTIONS].flatMap(
  (section) => section.items,
);

describe("navigation", () => {
  it.each(navigationItems.map((item) => [item.href]))("%s has a page", (href) => {
    expect(existsSync(resolve(APP_DIRECTORY, `.${href}`, "page.tsx"))).toBe(true);
  });

  it("lists the coding agent as its own entry", () => {
    const hrefs = USER_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain("/coding-agent");
    expect(navigationItems.some((item) => item.alsoMatches?.includes("/coding-agent"))).toBe(false);
  });
});
