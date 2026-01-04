import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AppSidebar } from "@/components/app-sidebar";
import { hasEnvVars } from "@/lib/utils";
import { Suspense } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-slate-200/50 bg-white/70 backdrop-blur-lg px-6 dark:border-white/10 dark:bg-black/40">
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            {!hasEnvVars ? null : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
            <ThemeSwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-transparent">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

