import { FormEvent, useState } from "react";
import { Building2, LogIn, Plus, RefreshCw, X } from "lucide-react";
import { Button, EmptyState, LoadingState, PageHeader } from "./ui";
import type { WorkspaceListItem } from "../types";

type WorkspaceSelectProps = {
  workspaces: WorkspaceListItem[];
  isLoading: boolean;
  canCreateWorkspace: boolean;
  onRefresh: () => void;
  onSelect: (workspace: WorkspaceListItem) => void;
  onCreateWorkspace: (input: {
    name: string;
    defaultAreaName?: string;
    defaultLocalityName?: string;
    defaultLocalityCode?: string;
  }) => Promise<void>;
  onGoToLogin: () => void;
};

function readFormString(form: HTMLFormElement, fieldName: string) {
  const value = new FormData(form).get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

export function WorkspaceSelect({
  workspaces,
  isLoading,
  canCreateWorkspace,
  onRefresh,
  onSelect,
  onCreateWorkspace,
  onGoToLogin
}: WorkspaceSelectProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const form = event.currentTarget;
      const defaultAreaName = readFormString(form, "defaultAreaName");
      const defaultLocalityName = readFormString(form, "defaultLocalityName");
      const defaultLocalityCode = readFormString(form, "defaultLocalityCode");

      await onCreateWorkspace({
        name: readFormString(form, "name"),
        defaultAreaName: defaultAreaName || undefined,
        defaultLocalityName: defaultLocalityName || undefined,
        defaultLocalityCode: defaultLocalityCode || undefined
      });
      setIsCreateModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear el workspace.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
            {canCreateWorkspace ? (
              <Button icon={<Plus size={17} />} variant="primary" onClick={() => setIsCreateModalOpen(true)}>Nuevo workspace</Button>
            ) : undefined}
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
          action={canCreateWorkspace ? (
            <Button icon={<Plus size={17} />} variant="primary" onClick={() => setIsCreateModalOpen(true)}>Crear workspace</Button>
          ) : undefined}
        />
      ) : undefined}

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="task-modal admin-modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>Crear nueva empresa</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsCreateModalOpen(false)} aria-label="Cerrar modal">
                <X size={18} />
              </button>
            </header>

            {errorMessage ? <p className="form-error">{errorMessage}</p> : undefined}

            <form className="form-stack admin-modal-form" onSubmit={handleCreateWorkspace}>
              <label className="wide-field">
                Nombre del workspace
                <input name="name" placeholder="Ej. Vianko Operaciones Norte" minLength={2} maxLength={120} required />
              </label>
              <label>
                Area inicial
                <input name="defaultAreaName" placeholder="TI" defaultValue="TI" minLength={2} maxLength={120} />
              </label>
              <label>
                Localidad inicial
                <input name="defaultLocalityName" placeholder="Guadalajara" defaultValue="Guadalajara" minLength={2} maxLength={120} />
              </label>
              <label>
                Codigo de localidad
                <input name="defaultLocalityCode" placeholder="GDL" defaultValue="GDL" minLength={2} maxLength={24} />
              </label>
              <p className="workspace-create-note">
                El creador queda como Admin del nuevo workspace. Despues puedes entrar a Miembros para invitar gerentes,
                crear areas, localidades y puestos propios de esa empresa.
              </p>
              <div className="modal-actions">
                <button className="secondary-action" type="button" onClick={() => setIsCreateModalOpen(false)}>
                  Cancelar
                </button>
                <button className="primary-action" type="submit" disabled={isSubmitting}>
                  <Plus size={18} />
                  {isSubmitting ? "Creando..." : "Crear workspace"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : undefined}
    </main>
  );
}
