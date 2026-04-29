import { ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotebookLMEnabled } from "@/hooks/useAppSettings";
import {
  LayoutDashboard,
  BookOpen,
  ListChecks,
  Library,
  ShieldCheck,
  Users,
  Server,
  LogOut,
  Sparkles,
  Upload,
  Settings as SettingsIcon,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  notebookLM?: boolean;
}

const items: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: Library },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/notebooks", label: "Notebooks", icon: BookOpen, notebookLM: true },
  { to: "/jobs", label: "Jobs", icon: ListChecks, notebookLM: true },
  { to: "/admin/approvals", label: "Approvals", icon: ShieldCheck, adminOnly: true },
  { to: "/admin/users", label: "Users", icon: Users, adminOnly: true },
  { to: "/admin/worker", label: "Worker", icon: Server, adminOnly: true },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, adminOnly: true },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const { value: nblmEnabled } = useNotebookLMEnabled();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visible = items.filter((i) => {
    if (i.adminOnly && !isAdmin) return false;
    if (i.notebookLM && !nblmEnabled && !isAdmin) return false;
    return true;
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-brand">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-serif text-base font-semibold text-sidebar-accent-foreground">Workbench</div>
            <div className="text-xs text-sidebar-foreground/60 -mt-0.5">Content Library</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.adminOnly && (
              <span className="ml-auto text-[10px] uppercase tracking-wider text-sidebar-foreground/50">admin</span>
            )}
            {item.notebookLM && !nblmEnabled && (
              <span className="ml-auto text-[10px] uppercase tracking-wider text-sidebar-foreground/50">off</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <NavLink to="/account" onClick={onNavigate} className="min-w-0 flex-1 group">
            <div className="text-sm font-medium truncate text-sidebar-accent-foreground group-hover:underline">
              {profile?.display_name ?? profile?.email}
            </div>
            <div className="text-xs text-sidebar-foreground/60">
              {isAdmin ? "Admin" : "Content Developer"}
            </div>
          </NavLink>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-brand shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-serif text-base font-semibold truncate">Workbench</span>
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-10 py-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
