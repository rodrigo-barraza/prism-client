import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccessAdminSide } from "@/utils/adminAccess";
import AdminShell from "../../components/AdminShellComponent";
import { ADMIN_DATE_RANGE_COOKIE, parseAdminDateRange } from "@/utils/adminDateRange";

export const metadata = {
  title: "Iris — Prism Admin Dashboard",
  description:
    "Analytics, activity monitoring, and administration for Prism AI Gateway",
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Hiding the sidebar link is cosmetic — this is the actual gate for
  // anyone navigating to /admin directly. Mirrors the middleware's trust
  // model: private-network hosts bypass auth (no session exists there).
  const [session, headerList, cookieStore] = await Promise.all([
    auth(),
    headers(),
    cookies(),
  ]);
  const canAccessAdmin = canAccessAdminSide({
    roles: session?.user?.roles,
    host: headerList.get("host"),
  });
  if (!canAccessAdmin) {
    redirect("/");
  }

  // Rendered with the viewer's saved range, so the page hydrates with it.
  const initialDateRange = parseAdminDateRange(
    cookieStore.get(ADMIN_DATE_RANGE_COOKIE)?.value,
  );

  return (
    <AdminShell initialDateRange={initialDateRange}>
      <Suspense>{children}</Suspense>
    </AdminShell>
  );
}
