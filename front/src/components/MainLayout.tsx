import { useState, type ReactNode } from 'react';
import { Bell, ChevronDown, CircleCheck, FolderKanban, HelpCircle, LogOut, Plus, UsersRound, Building2 } from 'lucide-react';
import { GuideDrawer } from './GuideDrawer';
import type { AuthSession, ViewKey, WorkspaceListItem } from '../types';
import { initials } from '../lib/format';
import { getWorkspaceCapabilities } from '../lib/permissions';
import { roleLabel } from '../lib/roles';

type MainLayoutProps = {
  session: AuthSession; workspace: WorkspaceListItem; currentView: ViewKey;
  notificationPermission: 'default' | 'denied' | 'granted' | 'unsupported'; children: ReactNode;
  unreadCount: number; connectionState: 'connecting' | 'live' | 'reconnecting';
  onViewChange: (view: ViewKey) => void; onEnableNotifications: () => void;
  onChangeWorkspace: () => void; onLogout: () => void; onCreateTask?: () => void;
};
export function MainLayout({ session, workspace, currentView, children, unreadCount, connectionState, onViewChange, onChangeWorkspace, onLogout, onCreateTask }: MainLayoutProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const caps = getWorkspaceCapabilities(workspace);
  const teamTabs: { key: ViewKey; label: string }[] = [
    ...(caps.canViewMembers ? [{ key: 'members' as const, label: 'Personas' }] : []),
    ...(caps.canViewManagement ? [{ key: 'management' as const, label: 'Apoyo entre áreas' }] : []),
    ...(caps.canManageRoles ? [{ key: 'roles' as const, label: 'Roles y acceso' }] : []),
    ...(caps.canManageOrganization ? [{ key: 'organization' as const, label: 'Áreas y localidades' }] : [])
  ];
  const section = teamTabs.some(tab => tab.key === currentView) ? 'team' : ['projects', 'board', 'completed'].includes(currentView) ? 'projects' : currentView === 'notifications' ? 'inbox' : 'work';
  const tabs = section === 'team' ? teamTabs : section === 'projects' ? [{ key: 'projects' as const, label: 'Todos los proyectos' }, ...(currentView === 'board' ? [{ key: 'board' as const, label: 'Proyecto abierto' }] : []), { key: 'completed' as const, label: 'Trabajo terminado' }] : section === 'work' ? [{ key: 'work' as const, label: 'Mi día' }, ...(caps.canViewWorkspaceReports ? [{ key: 'reports' as const, label: 'Avance del equipo' }] : [])] : [];
  const nav = [
    { key: 'work', view: 'work' as const, label: 'Mi trabajo', icon: <CircleCheck size={19} /> },
    { key: 'projects', view: 'projects' as const, label: 'Proyectos', icon: <FolderKanban size={19} /> },
    ...(teamTabs.length ? [{ key: 'team', view: teamTabs[0].key, label: 'Personas', icon: <UsersRound size={19} /> }] : [])
  ];
  function go(view: ViewKey) { setAccountOpen(false); onViewChange(view); }
  return <div className="day-app" data-view={currentView}>
    <header className="day-header">
      <button className="day-logo" onClick={() => go('work')} aria-label="Vianko Day, inicio"><span>v</span><strong>vianko<span>day</span></strong></button>
      <nav className="day-navigation" aria-label="Navegación principal">{nav.map(item => <button key={item.key} className={section === item.key ? 'selected' : ''} aria-current={section === item.key ? 'page' : undefined} onClick={() => go(item.view)}>{item.icon}{item.label}</button>)}</nav>
      <div className="day-header-actions">{onCreateTask && <button className="day-create" onClick={onCreateTask}><Plus size={19} /><span>Crear tarea</span></button>}
        <button className={`day-notifications ${section === 'inbox' ? 'selected' : ''}`} aria-label={`Notificaciones, ${unreadCount} sin leer`} onClick={() => go('notifications')}><Bell size={21} />{unreadCount > 0 && <b>{unreadCount > 99 ? '99+' : unreadCount}</b>}</button>
        <div className="day-account"><button className="day-account-toggle" aria-label="Mi cuenta" aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)}><span>{initials(session.user.name)}</span><ChevronDown size={14} /></button>{accountOpen && <><button className="day-popover-dismiss" aria-label="Cerrar cuenta" onClick={() => setAccountOpen(false)} /><div className="day-account-menu"><strong>{session.user.name}</strong><small>{roleLabel(workspace.member.role)}</small><p>{workspace.name}</p><button onClick={onChangeWorkspace}><Building2 size={16} />Cambiar empresa</button><button onClick={() => { setAccountOpen(false); setGuideOpen(true); }}><HelpCircle size={16} />Cómo funciona</button><button onClick={onLogout}><LogOut size={16} />Cerrar sesión</button></div></>}</div>
      </div>
    </header>
    <div className="day-context"><span className="day-company"><Building2 size={14} />{workspace.name}</span><nav aria-label="Secciones">{tabs.map(tab => <button key={tab.key} className={currentView === tab.key ? 'selected' : ''} aria-current={currentView === tab.key ? 'page' : undefined} onClick={() => go(tab.key)}>{tab.label}</button>)}</nav><span className={`day-live ${connectionState}`} role="status"><i />{connectionState === 'live' ? 'Actualizaciones en tiempo real' : connectionState === 'connecting' ? 'Conectando…' : 'Recuperando conexión…'}</span></div>
    {connectionState !== 'live' && <div className="connection-banner" role="status"><span className="connection-indicator"/><span>{connectionState === 'connecting' ? 'Conectando las actualizaciones del equipo…' : 'Reconectando. Las tareas y los mensajes nuevos se actualizarán al recuperar la conexión.'}</span></div>}
    <main className={`day-main day-section-${section}`}>{children}</main>
    <nav className="day-mobile-nav" aria-label="Navegación móvil">{nav.map(item => <button key={item.key} className={section === item.key ? 'selected' : ''} onClick={() => go(item.view)}>{item.icon}<span>{item.label}</span></button>)}<button className={section === 'inbox' ? 'selected' : ''} onClick={() => go('notifications')}><Bell size={19} /><span>Avisos{unreadCount ? ` (${unreadCount})` : ''}</span></button></nav>
    {guideOpen && <GuideDrawer currentView={currentView} isOpen onClose={() => setGuideOpen(false)} />}
  </div>;
}
