/**
 * PrismSessionGateComponent: nothing of the app renders — so nothing calls
 * prism-service — until the user's first Prism token is in hand; the
 * sign-in page renders bare; a session that is gone goes to /login.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const tokens = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/services/prismTokenManager", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/prismTokenManager")>()),
  requestPrismToken: tokens.request,
}));
const route = vi.hoisted(() => ({ pathname: "/chat" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

// The app's providers fetch on their own; here they are stand-ins that show
// whether the gate rendered them.
vi.mock("../ProfileContextComponent", () => ({
  ProfileProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-providers">{children}</div>
  ),
}));
vi.mock("../WorkspaceContextComponent", () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../SessionTrackerComponent", () => ({ default: () => null }));
vi.mock("../UserAvatarDropdownComponent", () => ({ default: () => null }));

import PrismSessionGateComponent, {
  pageNavigation,
  signInHref,
} from "../PrismSessionGateComponent";
import { PrismSignInRequiredError } from "@/services/prismTokenManager";
import { EVENT_NAME_PRISM_SIGN_IN_REQUIRED } from "@/constants";

function deferred<Value>() {
  let resolve: (_value: Value) => void = () => {};
  let reject: (_reason: unknown) => void = () => {};
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderGate() {
  return render(
    <PrismSessionGateComponent>
      <p>the page</p>
    </PrismSessionGateComponent>,
  );
}

describe("PrismSessionGateComponent", () => {
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    route.pathname = "/chat";
    tokens.request.mockReset();
    navigate = vi.spyOn(pageNavigation, "assign").mockImplementation(() => {});
  });

  afterEach(() => {
    navigate.mockRestore();
  });

  it("renders nothing of the app until the first token is in hand", async () => {
    const token = deferred<string>();
    tokens.request.mockReturnValue(token.promise);
    renderGate();
    expect(screen.queryByText("the page")).toBeNull();
    expect(screen.queryByTestId("app-providers")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => token.resolve("token-in-hand"));
    expect(screen.getByTestId("app-providers")).toHaveTextContent("the page");
    expect(tokens.request).toHaveBeenCalledTimes(1);
  });

  it("renders the sign-in page bare, asking for no token", () => {
    route.pathname = "/login";
    renderGate();
    expect(screen.getByText("the page")).toBeInTheDocument();
    expect(screen.queryByTestId("app-providers")).toBeNull();
    expect(tokens.request).not.toHaveBeenCalled();
  });

  it("goes to the sign-in page when the session is gone, coming back here after", async () => {
    tokens.request.mockRejectedValue(new PrismSignInRequiredError(401));
    renderGate();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, { detail: { status: 401 } }));
    });
    expect(navigate).toHaveBeenCalledWith(signInHref(401, window.location));
    // No error screen: the page is on its way to /login.
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("offers to try again when the token route fails", async () => {
    tokens.request.mockRejectedValueOnce(new Error("Prism sign-in is not configured (PRISM_USER_TOKEN_SECRET)."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderGate();
    expect(await screen.findByText("Prism sign-in is not configured (PRISM_USER_TOKEN_SECRET).")).toBeInTheDocument();
    expect(screen.queryByText("the page")).toBeNull();

    tokens.request.mockResolvedValueOnce("token-in-hand");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /try again/i })));
    expect(screen.getByText("the page")).toBeInTheDocument();
    expect(tokens.request).toHaveBeenCalledTimes(2);
  });
});

describe("signInHref", () => {
  it("comes back to the page the user was on", () => {
    expect(signInHref(401, { pathname: "/chat", search: "?conversation=c-1" })).toBe(
      "/login?callbackUrl=%2Fchat%3Fconversation%3Dc-1",
    );
  });

  it("says why when the account may not use Prism", () => {
    expect(signInHref(403, { pathname: "/admin", search: "" })).toBe(
      "/login?callbackUrl=%2Fadmin&error=AccessDenied",
    );
  });
});
