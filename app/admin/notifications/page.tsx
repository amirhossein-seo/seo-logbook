import { getAdminNotifications, forceDispatchNotifications, retryAllFailedNotifications } from "../actions";
import { AdminNotificationsClient } from "./client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = 'force-dynamic';

async function forceDispatchAction(projectId: string, runId: string) {
  "use server";
  await forceDispatchNotifications(projectId, runId);
  revalidatePath("/admin/notifications");
}

async function retryAllAction() {
  "use server";
  const result = await retryAllFailedNotifications();
  revalidatePath("/admin/notifications");
  return result;
}

export default async function AdminNotificationsPage() {
  const notifications = await getAdminNotifications(50);

  return (
    <AdminNotificationsClient
      initialNotifications={notifications as any}
      onForceDispatch={forceDispatchAction}
      onRetryAll={retryAllAction}
    />
  );
}
