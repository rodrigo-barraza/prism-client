import { describe, it, expect } from "vitest";
import { ADMIN_ROLE, canAccessAdminSide, hasAdminRole, isPrivateHost } from "../adminAccess";

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

  describe("isPrivateHost", () => {
    it.each([
      "localhost",
      "localhost:3333",
      "127.0.0.1",
      "127.0.0.1:3000",
      "10.0.0.5",
      "172.16.1.2",
      "172.31.255.255",
      "192.168.1.50:8080",
      "[::1]:3333",
    ])("is true for private host %s", (host) => {
      expect(isPrivateHost(host)).toBe(true);
    });

    it.each([
      "prism.rod.dev",
      "rod.dev",
      "example.com",
      "172.32.0.1", // outside the 172.16–31 private block
      "8.8.8.8",
      "localhost.evil.com",
    ])("is false for public host %s", (host) => {
      expect(isPrivateHost(host)).toBe(false);
    });

    it("is false for missing hosts", () => {
      expect(isPrivateHost(null)).toBe(false);
      expect(isPrivateHost(undefined)).toBe(false);
      expect(isPrivateHost("")).toBe(false);
    });
  });

  describe("canAccessAdminSide", () => {
    it("allows admins on public hosts", () => {
      expect(canAccessAdminSide({ roles: [ADMIN_ROLE], host: "prism.rod.dev" })).toBe(true);
    });

    it("allows anyone on private hosts (auth middleware is bypassed there)", () => {
      expect(canAccessAdminSide({ roles: [], host: "localhost:3333" })).toBe(true);
      expect(canAccessAdminSide({ host: "192.168.1.20" })).toBe(true);
    });

    it("denies non-admins on public hosts", () => {
      expect(canAccessAdminSide({ roles: [], host: "prism.rod.dev" })).toBe(false);
      expect(canAccessAdminSide({ roles: ["viewer"], host: "rod.dev" })).toBe(false);
      expect(canAccessAdminSide({})).toBe(false);
    });
  });
});
