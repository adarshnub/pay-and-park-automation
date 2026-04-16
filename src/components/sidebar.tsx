"use client";

import Link from "next/link";
import { cn } from "@/src/lib/utils";
import {
  LayoutDashboard,
  LogIn,
  LogOut,
  Car,
  ClipboardList,
  Receipt,
  BarChart3,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/check-in", label: "Check In", icon: LogIn },
  { href: "/check-out", label: "Check Out", icon: LogOut },
  { href: "/active-vehicles", label: "Active Vehicles", icon: Car },
  { href: "/visits", label: "All Visits", icon: ClipboardList },
  { href: "/billing", label: "Billing", icon: Receipt },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

interface SidebarProps {
  currentPath: string;
}

export function Sidebar({ currentPath }: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card/95 shadow-sm md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <Car className="h-7 w-7 text-primary" />
        <span className="text-xl font-bold text-foreground">ParkEasy</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              currentPath === href ||
              (href !== "/dashboard" && currentPath.startsWith(href + "/"));

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/12 text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
