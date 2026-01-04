"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  Activity,
  Mail,
  AlertTriangle,
  Shield,
  ArrowLeft,
  Users,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const adminNavigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Control Room", href: "/admin/operations", icon: Activity },
  { name: "Delivery Hub", href: "/admin/notifications", icon: Mail },
  { name: "User Registry", href: "/admin/users", icon: Users },
  { name: "Error Log", href: "/admin/health", icon: AlertTriangle },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r border-red-200/50 bg-red-50/30 dark:bg-red-950/20 dark:border-red-900/50">
      {/* Logo/Branding with Admin Badge */}
      <div className="flex h-16 items-center border-b border-red-200/50 px-4 dark:border-red-900/50">
        <Link href="/admin" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-red-600 dark:bg-red-500 flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-red-900 dark:text-red-100 tracking-tight">
              Admin Panel
            </span>
            <span className="text-xs text-red-600 dark:text-red-400">
              Platform Control
            </span>
          </div>
        </Link>
      </div>

      {/* Security Notice */}
      <div className="px-4 py-3 border-b border-red-200/50 dark:border-red-900/50 bg-red-100/50 dark:bg-red-950/30">
        <div className="flex items-start gap-2">
          <Shield className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-red-900 dark:text-red-100">
              Super Admin Access
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              Platform-wide operations
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <div className="px-3 py-2 mb-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <Link href="/projects">
              <ArrowLeft className="h-3 w-3 mr-2" />
              Back to Projects
            </Link>
          </Button>
        </div>
        
        {adminNavigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800"
                  : "text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-900 dark:hover:text-red-100"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-red-200/50 px-4 py-3 dark:border-red-900/50">
        <p className="text-xs text-red-700 dark:text-red-400 text-center">
          Restricted Access
        </p>
      </div>
    </div>
  );
}

