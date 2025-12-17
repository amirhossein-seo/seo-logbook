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

  // Fetch workspaces and active workspace on mount and when workspace changes
  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Fetch all workspaces the user is a member of
          const allWorkspaces = await getAllWorkspaces();
          setWorkspaces(allWorkspaces);
          
          if (allWorkspaces.length > 0) {
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
        const fetchedProjects = await getProjects();
        setProjects(fetchedProjects);
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
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center border-b border-border px-3">
        {isLoadingWorkspaces ? (
          <div className="text-sm font-medium text-muted-foreground">
            Loading Workspaces...
          </div>
        ) : workspaces.length <= 1 ? (
          // Single workspace: show as static text with icon
          <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold text-foreground hover:opacity-80 transition-opacity">
            <Building2 className="h-5 w-5" />
            <span className="truncate">{currentWorkspace?.name || "My Workspace"}</span>
          </Link>
        ) : (
          // Multiple workspaces: show as dropdown
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between text-lg font-semibold text-foreground h-auto p-0 hover:bg-transparent"
              >
                <span className="flex items-center gap-2 truncate">
                  <Building2 className="h-5 w-5 shrink-0" />
                  {currentWorkspace?.name || "Select Workspace"}
                </span>
                <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>My Workspaces</DropdownMenuLabel>
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
            <div className="px-3 py-2">
              <Link
                href="/projects"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                ← Back to Projects
              </Link>
            </div>
            <div className="px-3 py-2 mb-2">
              <p className="text-xs font-medium text-foreground truncate">
                Project: {currentProject?.name || projectId}
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
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
