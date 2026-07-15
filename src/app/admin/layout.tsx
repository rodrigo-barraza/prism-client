import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccessAdminSide } from "@/utils/adminAccess";
import AdminShell from "../../components/AdminShellComponent";

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
  const [session, headerList] = await Promise.all([auth(), headers()]);
  const canAccessAdmin = canAccessAdminSide({
    roles: session?.user?.roles,
    host: headerList.get("host"),
  });
  if (!canAccessAdmin) {
    redirect("/");
  }

  return (
    <AdminShell>
      <Suspense>{children}</Suspense>
    </AdminShell>
  );
}
