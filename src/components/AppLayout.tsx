import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const items: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/notebooks", label: "Notebooks", icon: BookOpen },
  { to: "/jobs", label: "Jobs", icon: ListChecks },
  { to: "/library", label: "Library", icon: Library },
  { to: "/admin/approvals", label: "Approvals", icon: ShieldCheck, adminOnly: true },
  { to: "/admin/users", label: "Users", icon: Users, adminOnly: true },
  { to: "/admin/worker", label: "Worker", icon: Server, adminOnly: true },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const visible = items.filter((i) => !i.adminOnly || isAdmin);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-brand">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="font-serif text-base font-semibold text-sidebar-accent-foreground">Workbench</div>
              <div className="text-xs text-sidebar-foreground/60 -mt-0.5">NotebookLM Studio</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center justify-between">
            <NavLink to="/account" className="min-w-0 flex-1 group">
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
              onClick={async () => {
                await signOut();
                navigate("/auth");
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-6xl px-6 md:px-10 py-8">{children}</div>
      </main>
    </div>
  );
}
