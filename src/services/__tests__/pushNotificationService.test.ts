/**
 * Opting in to "needs you" notifications: permission → the service's VAPID
 * key → register /sw.js (told the API base) → subscribe → store the
 * subscription on the service. Opting out undoes both sides.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../PrismService", () => ({
  default: {
    getPushPublicKey: vi.fn(),
    savePushSubscription: vi.fn().mockResolvedValue({ ok: true }),
    deletePushSubscription: vi.fn().mockResolvedValue({ ok: true }),
  },
}));
vi.mock("../../config", () => ({ PRISM_SERVICE_URL: "https://api.prism.test" }));

import PrismService from "../PrismService";
import {
  base64UrlToBytes,
  disablePushNotifications,
  enablePushNotifications,
  pushAvailability,
  serviceWorkerUrl,
} from "../PushNotificationService";

const PUBLIC_KEY = "BAECAwQFBgcICQ"; // bytes 04 01 02 … 09

function installBrowser({ permission = "granted" }: { permission?: NotificationPermission } = {}) {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    options: { applicationServerKey: null as ArrayBuffer | null },
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockImplementation(async ({ applicationServerKey }) => {
      subscription.options.applicationServerKey = applicationServerKey.buffer;
      return subscription;
    }),
  };
  const registration = { pushManager };
  const serviceWorker = {
    register: vi.fn().mockResolvedValue(registration),
    getRegistration: vi.fn().mockResolvedValue(registration),
    ready: Promise.resolve(registration),
  };
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { requestPermission: vi.fn().mockResolvedValue(permission) },
  });
  return { serviceWorker, pushManager, subscription };
}

describe("PushNotificationService", () => {
  beforeEach(() => {
    vi.mocked(PrismService.getPushPublicKey).mockResolvedValue({ enabled: true, publicKey: PUBLIC_KEY });
    vi.mocked(PrismService.savePushSubscription).mockClear();
    vi.mocked(PrismService.deletePushSubscription).mockClear();
  });

  it("decodes a base64url VAPID key into bytes", () => {
    expect([...base64UrlToBytes(PUBLIC_KEY)]).toEqual([4, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("points the worker at the API base", () => {
    expect(serviceWorkerUrl()).toBe("/sw.js?api=https%3A%2F%2Fapi.prism.test");
  });

  it("enable: registers the worker, subscribes with the service key and stores the subscription", async () => {
    const browser = installBrowser();
    expect(pushAvailability()).toBe("supported");

    const result = await enablePushNotifications();

    expect(result).toEqual({ status: "enabled", endpoint: "https://fcm.googleapis.com/fcm/send/abc" });
    expect(browser.serviceWorker.register).toHaveBeenCalledWith(
      "/sw.js?api=https%3A%2F%2Fapi.prism.test",
      { scope: "/" },
    );
    const [{ userVisibleOnly, applicationServerKey }] = browser.pushManager.subscribe.mock.calls[0];
    expect(userVisibleOnly).toBe(true);
    expect([...applicationServerKey]).toEqual([4, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(PrismService.savePushSubscription).toHaveBeenCalledWith({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "p", auth: "a" },
    });
  });

  it("enable: a denied permission registers nothing", async () => {
    const browser = installBrowser({ permission: "denied" });
    expect(await enablePushNotifications()).toEqual({ status: "permission-denied" });
    expect(browser.serviceWorker.register).not.toHaveBeenCalled();
    expect(PrismService.savePushSubscription).not.toHaveBeenCalled();
  });

  it("enable: a service without VAPID keys is reported, nothing is registered", async () => {
    const browser = installBrowser();
    vi.mocked(PrismService.getPushPublicKey).mockResolvedValue({ enabled: false, publicKey: null });
    expect(await enablePushNotifications()).toEqual({ status: "server-disabled" });
    expect(browser.serviceWorker.register).not.toHaveBeenCalled();
  });

  it("disable: unsubscribes the browser and forgets the endpoint on the service", async () => {
    const browser = installBrowser();
    browser.pushManager.getSubscription.mockResolvedValue(browser.subscription);
    await disablePushNotifications();
    expect(browser.subscription.unsubscribe).toHaveBeenCalled();
    expect(PrismService.deletePushSubscription).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/fcm/send/abc",
    );
  });

  it("is unavailable outside a secure context", () => {
    installBrowser();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    expect(pushAvailability()).toBe("insecure-context");
  });
});
