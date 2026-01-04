"use client";

import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  BarChart3,
  FileText,
  Link as LinkIcon,
  CheckSquare,
  ChevronDown,
  Users,
  Building2,
  History,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProjects, getAllWorkspaces, getUserWorkspace, switchWorkspace } from "@/app/actions";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const globalNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Team", href: "/team", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

const projectNavigation = (projectId: string) => [
  { name: "Overview", href: `/projects/${projectId}/overview`, icon: BarChart3 },
  { name: "Logs", href: `/projects/${projectId}/logs`, icon: FileText },
  { name: "URLs", href: `/projects/${projectId}/urls`, icon: LinkIcon },
  { name: "Tasks", href: `/projects/${projectId}/tasks`, icon: CheckSquare },
  { name: "Monitor History", href: `/projects/${projectId}/monitor-history`, icon: History },
  { name: "Notifications", href: `/projects/${projectId}/notifications`, icon: Bell },
  { name: "Settings", href: `/projects/${projectId}/settings`, icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as string | undefined;
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);

  // Determine if we're in a project context
  const isProjectContext = projectId !== undefined;
  const navigation = isProjectContext
    ? projectNavigation(projectId)
    : globalNavigation;

  const [userName, setUserName] = useState<string | null>(null);

  // Fetch workspaces and active workspace on mount and when workspace changes
  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Get user's full name from metadata
          const fullName = user.user_metadata?.full_name || 
                          user.raw_user_meta_data?.full_name || 
                          null;
          setUserName(fullName || user.email || null);

          // Fetch all workspaces the user is a member of
          const allWorkspaces = await getAllWorkspaces();
          
          // Filter out any null or undefined items to ensure type safety
          const validWorkspaces = allWorkspaces.filter(
            (ws): ws is { id: string; name: string } => 
              ws !== null && ws !== undefined && ws.id !== undefined
          );
          
          setWorkspaces(validWorkspaces);
          
          if (validWorkspaces.length > 0) {
            // Get the active workspace (checks cookie, accepts invites, etc.)
            const currentWorkspaceId = await getUserWorkspace(user.id);
            setActiveWorkspaceId(currentWorkspaceId);
          }
        }
      } catch (error) {
        console.error("Error fetching workspaces:", error);
      } finally {
        setIsLoadingWorkspaces(false);
      }
    }
    fetchWorkspaces();
  }, [pathname]); // Refetch when route changes (in case invites were accepted)

  // Fetch projects on mount
  useEffect(() => {
    async function fetchProjects() {
      try {
        const { projects } = await getProjects();
        setProjects(projects);
      } catch (error) {
        console.error("Error fetching projects:", error);
      } finally {
        setIsLoadingProjects(false);
      }
    }
    fetchProjects();
  }, [activeWorkspaceId]); // Refetch projects when workspace changes

  // Find current project
  const currentProject = projects.find((p) => p.id === projectId);
  
  // Find current workspace
  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Handle workspace switching
  const handleWorkspaceSwitch = async (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) return;
    
    try {
      const result = await switchWorkspace(workspaceId);
      if (result?.error) {
        console.error("Error switching workspace:", result.error);
        return;
      }
      setActiveWorkspaceId(workspaceId);
      // Refresh to update all server components with new workspace context
      router.refresh();
    } catch (error) {
      console.error("Error switching workspace:", error);
    }
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200/50 bg-white dark:bg-slate-900">
      {/* Logo/Branding */}
      <div className="flex h-16 items-center border-b border-slate-200/50 px-4 dark:border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center">
            <span className="text-white dark:text-slate-900 text-sm font-bold">SL</span>
          </div>
          <span className="text-lg font-semibold text-slate-900 dark:text-foreground tracking-tight">
            SEO LogHub
          </span>
        </Link>
      </div>

      {/* Workspace Switcher */}
      <div className="border-b border-slate-200/50 px-3 py-3 dark:border-white/10">
        {isLoadingWorkspaces ? (
          <div className="text-sm font-medium text-muted-foreground">
            Loading...
          </div>
        ) : workspaces.length <= 1 ? (
          // Single workspace: show as static text with icon
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-foreground">
            <Building2 className="h-4 w-4 text-slate-500" />
            <span className="truncate">{currentWorkspace?.name || "My Workspace"}</span>
          </div>
        ) : (
          // Multiple workspaces: show as dropdown
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between text-sm font-medium text-slate-700 dark:text-foreground h-auto p-0 hover:bg-transparent"
              >
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                  {currentWorkspace?.name || "Select Workspace"}
                </span>
                <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>
                My Workspaces
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  onClick={() => handleWorkspaceSwitch(workspace.id)}
                  className={cn(
                    "cursor-pointer",
                    workspace.id === activeWorkspaceId && "bg-accent"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{workspace.name}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Project Switcher */}
      {projects.length > 0 && (
        <div className="border-b border-border px-3 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between text-sm font-medium"
              >
                <span className="truncate">
                  {isProjectContext && currentProject
                    ? currentProject.name || "Unnamed Project"
                    : "Select Project"}
                </span>
                <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Projects</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}/overview`)}
                  className="cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{project.name || "Unnamed Project"}</span>
                    {project.domain && (
                      <span className="text-xs text-muted-foreground">{project.domain}</span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {isProjectContext && (
          <>
            <div className="px-3 py-2 mb-2">
              <Link
                href="/projects"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                ← Back to Projects
              </Link>
            </div>
            <div className="px-3 py-2 mb-2">
              <p className="text-xs font-medium text-foreground truncate">
                {currentProject?.name || projectId}
              </p>
            </div>
          </>
        )}
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-foreground"
                  : "text-slate-600 dark:text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
