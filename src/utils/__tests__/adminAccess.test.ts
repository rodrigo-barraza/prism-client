import { describe, it, expect } from "vitest";
import { ADMIN_ROLE, hasAdminRole } from "../adminAccess";

describe("adminAccess", () => {
  describe("hasAdminRole", () => {
    it("is true when roles include the admin role", () => {
      expect(hasAdminRole([ADMIN_ROLE])).toBe(true);
      expect(hasAdminRole(["viewer", ADMIN_ROLE])).toBe(true);
    });

    it("is false for empty, missing, or non-admin roles", () => {
      expect(hasAdminRole([])).toBe(false);
      expect(hasAdminRole(["viewer"])).toBe(false);
      expect(hasAdminRole(undefined)).toBe(false);
      expect(hasAdminRole(null)).toBe(false);
    });

    it("does not match case-variant or partial role names", () => {
      expect(hasAdminRole(["Admin"])).toBe(false);
      expect(hasAdminRole(["administrator"])).toBe(false);
    });
  });
});
