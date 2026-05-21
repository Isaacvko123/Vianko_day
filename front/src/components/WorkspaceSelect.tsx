import { Building2, LogIn, Plus, RefreshCw } from "lucide-react";
import { Button, EmptyState, LoadingState, PageHeader } from "./ui";
import type { WorkspaceListItem } from "../types";

type WorkspaceSelectProps = {
  workspaces: WorkspaceListItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelect: (workspace: WorkspaceListItem) => void;
  onGoToLogin: () => void;
};

export function WorkspaceSelect({ workspaces, isLoading, onRefresh, onSelect, onGoToLogin }: WorkspaceSelectProps) {
  return (
    <main className="workspace-shell">
      <PageHeader
        eyebrow="Workspace"
        title="Elige donde vas a trabajar"
        description="Selecciona la empresa activa para cargar proyectos, tableros, miembros y reportes con los permisos correctos."
        actions={(
          <>
            <Button icon={<LogIn size={17} />} variant="ghost" onClick={onGoToLogin}>Ir a login</Button>
            <Button icon={<RefreshCw size={17} />} variant="secondary" onClick={onRefresh}>Actualizar</Button>
          </>
        )}
      />

      {isLoading ? <LoadingState label="Cargando empresas..." rows={3} /> : undefined}

      <section className="workspace-grid">
        {workspaces.map((workspace) => (
          <button className="workspace-card" type="button" key={workspace.id} onClick={() => onSelect(workspace)}>
            <span className="workspace-icon"><Building2 size={24} /></span>
            <strong>{workspace.name}</strong>
            <small>{workspace.member.role?.name ?? workspace.member.userType}</small>
          </button>
        ))}
      </section>

      {!isLoading && workspaces.length === 0 ? (
        <EmptyState
          icon={<Plus size={24} />}
          title="No tienes workspaces activos"
          description="Crea una cuenta nueva desde registro o solicita acceso a una empresa existente."
        />
      ) : undefined}
    </main>
  );
}
