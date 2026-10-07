/**
 * The Admin Side's own gate (app/admin/layout.tsx): the admin role, on any
 * host. A browser on the LAN used to get in without a session; now everyone
 * is signed in (proxy.ts), and the role decides.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT ${target}`);
  }),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3333" }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../../components/AdminShellComponent", () => ({ default: () => null }));

import AdminLayout from "../layout";

describe("the Admin Side's gate", () => {
  beforeEach(() => {
    auth.mockReset();
    redirect.mockClear();
  });

  it("turns away a signed-in user without the admin role — on the LAN too", async () => {
    auth.mockResolvedValue({ user: { email: "guest@example.com", roles: [] } });
    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT /");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("turns away a request with no session", async () => {
    auth.mockResolvedValue(null);
    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT /");
  });

  it("lets the admin role in", async () => {
    auth.mockResolvedValue({ user: { email: "owner@example.com", roles: ["admin"] } });
    await expect(AdminLayout({ children: null })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
