"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralSettings } from "./project-settings-general";
import { MonitoringSettings } from "./project-settings-monitoring";
import { NotificationSettings } from "./project-settings-notifications";
import { NotificationsHistoryTable } from "./notifications-history-table";
import { Separator } from "@/components/ui/separator";

interface ProjectSettingsTabsProps {
  projectId: string;
  projectName: string;
  emailAlertsEnabled: boolean;
  monitorFrequency: string;
}

export function ProjectSettingsTabs({
  projectId,
  projectName,
  emailAlertsEnabled,
  monitorFrequency,
}: ProjectSettingsTabsProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering Tabs until client-side mount
  if (!isMounted) {
    return (
      <div className="w-full">
        <div className="grid w-full grid-cols-3 gap-2 mb-6">
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
        </div>
        <div className="mt-6">
          <div className="h-64 bg-slate-100 dark:bg-slate-900 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="general" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="mt-6">
        <GeneralSettings projectId={projectId} projectName={projectName} />
      </TabsContent>

      <TabsContent value="monitoring" className="mt-6">
        <MonitoringSettings projectId={projectId} monitorFrequency={monitorFrequency} />
      </TabsContent>

      <TabsContent value="notifications" className="mt-6">
        <NotificationSettings projectId={projectId} emailAlertsEnabled={emailAlertsEnabled} />
        
        <Separator className="my-6" />
        
        <div>
          <h3 className="text-lg font-medium mb-4">Notification History</h3>
          <NotificationsHistoryTable projectId={projectId} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

