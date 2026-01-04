import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminUsers } from "../actions";
import { AdminUsersClient } from "./client";
import { revalidatePath } from "next/cache";

export const dynamic = 'force-dynamic';

async function updateQuotasAction(userId: string, maxUrls: number | null, maxMonitors: number | null) {
  "use server";
  const { updateUserQuotas } = await import("../actions");
  const result = await updateUserQuotas(userId, maxUrls, maxMonitors);
  revalidatePath("/admin/users");
  return result;
}

export default async function AdminUsersPage() {
  const supabase = await createClient();
  
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/sign-in");
  }

  // Hardcoded super-admin check - ONLY this specific user ID can access
  const SUPER_ADMIN_ID = "781c7402-f347-42ac-a4ad-942b78848278";
  if (user.id !== SUPER_ADMIN_ID) {
    redirect("/projects");
  }

  const users = await getAdminUsers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Platform User Registry
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage all platform users, their roles, and workspace quotas
        </p>
      </div>

      <AdminUsersClient initialUsers={users} onUpdateQuotas={updateQuotasAction} />
    </div>
  );
}

