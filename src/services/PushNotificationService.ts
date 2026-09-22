import PrismService from "./PrismService";
import { PRISM_SERVICE_URL } from "../config";

/**
 * Browser push for "needs you" notifications — the opt-in half.
 *
 * Enabling asks for notification permission, registers `/sw.js` (only
 * then: nothing is registered for users who never opt in), subscribes the
 * browser's push manager with prism-service's VAPID key and stores the
 * subscription on the service under the current user and profile.
 * Disabling unsubscribes and forgets it on both sides.
 */

export type PushAvailability =
  /** Service workers, the Push API and notifications all exist here. */
  | "supported"
  /** Push needs a secure context (https, or localhost). */
  | "insecure-context"
  | "unsupported";

export type PushEnableResult =
  | { status: "enabled"; endpoint: string }
  | { status: "permission-denied" }
  /** prism-service has no VAPID keys configured. */
  | { status: "server-disabled" }
  | { status: "unsupported"; availability: PushAvailability };

const SERVICE_WORKER_SCOPE = "/";

/** The worker script, told where prism-service lives (its approve POSTs go there). */
export function serviceWorkerUrl(apiBase: string = PRISM_SERVICE_URL || ""): string {
  return `/sw.js?api=${encodeURIComponent(apiBase)}`;
}

export function pushAvailability(): PushAvailability {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure-context";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return "supported";
}

/** base64url (a VAPID public key) → the bytes `applicationServerKey` wants. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sameKey(subscription: PushSubscription, publicKey: Uint8Array): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return false;
  const currentBytes = new Uint8Array(current);
  return (
    currentBytes.length === publicKey.length &&
    currentBytes.every((byte, index) => byte === publicKey[index])
  );
}

/** This browser's current push subscription, if notifications are on. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (pushAvailability() !== "supported") return null;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function enablePushNotifications(): Promise<PushEnableResult> {
  const availability = pushAvailability();
  if (availability !== "supported") return { status: "unsupported", availability };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { status: "permission-denied" };

  const { enabled, publicKey } = await PrismService.getPushPublicKey();
  if (!enabled || !publicKey) return { status: "server-disabled" };
  const applicationServerKey = base64UrlToBytes(publicKey);

  const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), {
    scope: SERVICE_WORKER_SCOPE,
  });
  await navigator.serviceWorker.ready;

  // A subscription made with an older key cannot receive this server's pushes.
  const existing = await registration.pushManager.getSubscription();
  if (existing && !sameKey(existing, applicationServerKey)) await existing.unsubscribe();

  const subscription =
    (existing && sameKey(existing, applicationServerKey) ? existing : null) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }));
  await PrismService.savePushSubscription(subscription.toJSON());
  return { status: "enabled", endpoint: subscription.endpoint };
}

export async function disablePushNotifications(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await PrismService.deletePushSubscription(endpoint).catch(() => {
    // Already gone on the server (or it expired): nothing left to forget.
  });
}
