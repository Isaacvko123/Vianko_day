import { useState, type ReactNode } from "react";
import { Archive, BarChart3, Bell, BriefcaseBusiness, HelpCircle, KanbanSquare, LogOut, Network, UsersRound } from "lucide-react";
import { GuideDrawer } from "./GuideDrawer";
import { Badge, Button, cx } from "./ui";
import type { AuthSession, ViewKey, WorkspaceListItem } from "../types";
import { initials } from "../lib/format";
import { getWorkspaceCapabilities } from "../lib/permissions";

type MainLayoutProps = {
  session: AuthSession;
  workspace: WorkspaceListItem;
  currentView: ViewKey;
  notificationPermission: "default" | "denied" | "granted" | "unsupported";
  children: ReactNode;
  onViewChange: (view: ViewKey) => void;
  onEnableNotifications: () => void;
  onChangeWorkspace: () => void;
  onLogout: () => void;
};

const navItems: Array<{ key: ViewKey; label: string; icon: ReactNode }> = [
  { key: "projects", label: "Proyectos", icon: <BriefcaseBusiness size={18} /> },
  { key: "board", label: "Tablero", icon: <KanbanSquare size={18} /> },
  { key: "completed", label: "Terminadas", icon: <Archive size={18} /> },
  { key: "management", label: "Gerencia", icon: <Network size={18} /> },
  { key: "members", label: "Miembros", icon: <UsersRound size={18} /> },
  { key: "reports", label: "Reportes", icon: <BarChart3 size={18} /> }
];

export function MainLayout({
  session,
  workspace,
  currentView,
  notificationPermission,
  children,
  onViewChange,
  onEnableNotifications,
  onChangeWorkspace,
  onLogout
}: MainLayoutProps) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const capabilities = getWorkspaceCapabilities(workspace);
  const visibleNavItems = navItems.filter((item) => {
    if (item.key === "projects" || item.key === "board" || item.key === "completed") {
      return true;
    }

    if (item.key === "management") {
      return capabilities.canViewManagement;
    }

    if (item.key === "members") {
      return capabilities.canViewMembers;
    }

    if (item.key === "reports") {
      return capabilities.canViewWorkspaceReports;
    }

    return false;
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-dot">VD</span>
          <div>
            <strong>Vianko Day</strong>
            <small>{workspace.name}</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navegacion principal">
          {visibleNavItems.map((item) => (
            <button
              key={item.key}
              className={cx(currentView === item.key && "active")}
              data-guide={`nav-${item.key}`}
              type="button"
              onClick={() => onViewChange(item.key)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="guide-button" data-guide="guide-open" type="button" onClick={() => setIsGuideOpen(true)}>
            <HelpCircle size={17} />
            Guia de uso
          </button>
          <button className="workspace-switch" type="button" onClick={onChangeWorkspace}>
            Cambiar workspace
          </button>
          <div className="user-chip">
            <span>{initials(session.user.name)}</span>
            <div>
              <strong>{session.user.name}</strong>
              <small>{session.user.email}</small>
            </div>
          </div>
          <button className="danger-button" type="button" onClick={onLogout}>
            <LogOut size={17} />
            Salir
          </button>
        </div>
      </aside>
      <section className="content-shell">
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/85 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-sm font-black text-blue-700">{initials(workspace.name)}</span>
            <div className="min-w-0">
              <strong className="block truncate text-sm font-black text-slate-950">{workspace.name}</strong>
              <span className="block truncate text-xs font-bold text-slate-500">{session.user.email}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{workspace.member.role?.name ?? workspace.member.userType}</Badge>
            <Button
              icon={<Bell size={16} />}
              size="sm"
              variant={notificationPermission === "granted" ? "secondary" : "ghost"}
              data-guide="notifications-enable"
              onClick={onEnableNotifications}
              disabled={notificationPermission === "unsupported" || notificationPermission === "granted"}
            >
              {notificationPermission === "granted" ? "Notificaciones ON" : "Activar notificaciones"}
            </Button>
            <Button icon={<HelpCircle size={16} />} size="sm" variant="ghost" data-guide="guide-open-top" onClick={() => setIsGuideOpen(true)}>Guia</Button>
            <Button size="sm" variant="secondary" onClick={onChangeWorkspace}>Workspace</Button>
          </div>
        </div>
        {children}
      </section>
      <button className="guide-fab" data-guide="guide-open-floating" type="button" onClick={() => setIsGuideOpen(true)} aria-label="Abrir guia de uso">
        <HelpCircle size={19} />
        Guia
      </button>
      {isGuideOpen ? <GuideDrawer currentView={currentView} isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} /> : undefined}
    </div>
  );
}
