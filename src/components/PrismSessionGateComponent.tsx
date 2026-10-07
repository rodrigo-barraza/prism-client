"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ComponentsProvider,
  ErrorFallbackComponent,
} from "@rodrigo-barraza/components-library";
import { EVENT_NAME_PRISM_SIGN_IN_REQUIRED, SIGN_IN_PAGE } from "@/constants";
import {
  PrismSignInRequiredError,
  requestPrismToken,
} from "@/services/prismTokenManager";
import { getErrorMessage } from "@/utils/errorMessage";
import { ProfileProvider } from "./ProfileContextComponent";
import { WorkspaceProvider } from "./WorkspaceContextComponent";
import SessionTrackerComponent from "./SessionTrackerComponent";
import UserAvatarDropdownComponent from "./UserAvatarDropdownComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./PrismSessionGateComponent.module.css";

/** A full page load: nothing of a session that is gone survives it. */
export const pageNavigation = {
  assign(href: string): void {
    window.location.assign(href);
  },
};

/** The sign-in page, coming back to `location` afterwards. */
export function signInHref(
  status: 401 | 403,
  location: Pick<Location, "pathname" | "search">,
): string {
  const parameters = new URLSearchParams({
    callbackUrl: location.pathname + location.search,
  });
  if (status === 403) parameters.set("error", "AccessDenied");
  return `${SIGN_IN_PAGE}?${parameters.toString()}`;
}

/**
 * The app runs only for a signed-in user whose Prism token is in hand:
 * every call to prism-service carries it, so nothing below — the profile
 * and workspace providers, the page — renders, and so nothing fetches,
 * until the first one arrives. When the session is gone (the token route
 * refuses), the app goes to the sign-in page and comes back here after.
 *
 * The sign-in page renders bare: the data providers would only ask for a
 * token it cannot have.
 */
export default function PrismSessionGateComponent({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isSignInPage = pathname === SIGN_IN_PAGE;
  const [status, setStatus] = useState<"waiting" | "ready" | "failed">("waiting");
  const [failure, setFailure] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const goSignIn = (event: Event) => {
      if (window.location.pathname === SIGN_IN_PAGE) return;
      const { status: refusal } =
        (event as CustomEvent<{ status?: number }>).detail ?? {};
      pageNavigation.assign(
        signInHref(refusal === 403 ? 403 : 401, window.location),
      );
    };
    window.addEventListener(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, goSignIn);
    return () =>
      window.removeEventListener(EVENT_NAME_PRISM_SIGN_IN_REQUIRED, goSignIn);
  }, []);

  useEffect(() => {
    if (isSignInPage) return;
    let isCurrent = true;
    requestPrismToken().then(
      () => {
        if (isCurrent) setStatus("ready");
      },
      (error: unknown) => {
        // Signed out: the listener above is already on its way to /login.
        if (!isCurrent || error instanceof PrismSignInRequiredError) return;
        setFailure(new Error(getErrorMessage(error)));
        setStatus("failed");
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [isSignInPage, attempt]);

  if (isSignInPage) return <>{children}</>;

  if (status === "ready") {
    return (
      <ProfileProvider>
        <ComponentsProvider sound userMenu={<UserAvatarDropdownComponent />}>
          <WorkspaceProvider>
            {children}
            <SessionTrackerComponent />
          </WorkspaceProvider>
        </ComponentsProvider>
      </ProfileProvider>
    );
  }

  return (
    <main className={styles["gate-screen"]}>
      {status === "failed" ? (
        <ErrorFallbackComponent
          error={failure}
          title="Prism couldn’t sign you in"
          logLabel="[Prism sign-in]"
          reset={() => {
            setStatus("waiting");
            setAttempt((count) => count + 1);
          }}
        />
      ) : (
        <PanelLoadingSpinner size="large" />
      )}
    </main>
  );
}
