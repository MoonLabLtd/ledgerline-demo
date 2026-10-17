import { BarChart3, LayoutDashboard, Package, Receipt, Settings, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; description: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, description: "Key metrics for the selected period" },
  { href: "/sales", label: "Sales", icon: Receipt, description: "Every transaction, searchable and exportable" },
  { href: "/products", label: "Products", icon: Package, description: "Catalog, categories and product performance" },
  { href: "/customers", label: "Customers", icon: Users, description: "Customer records and purchase history" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, description: "Trends, rankings and breakdowns" },
  { href: "/settings", label: "Settings", icon: Settings, description: "Preferences, data and backups" },
];

export function navItemFor(pathname: string): NavItem {
  return NAV.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))) ?? NAV[0];
}
