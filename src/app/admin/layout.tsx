import { Suspense } from "react";
import AdminShell from "../../components/AdminShellComponent";

export const metadata = {
  title: "Iris — Prism Admin Dashboard",
  description:
    "Analytics, activity monitoring, and administration for Prism AI Gateway",
};

// @ts-ignore
export default function AdminLayout({ children: any }) {
  // @ts-ignore
  return <AdminShell><Suspense>{children}</Suspense></AdminShell>;
}
