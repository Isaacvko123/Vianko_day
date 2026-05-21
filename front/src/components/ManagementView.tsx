import { FormEvent, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Plus,
  RefreshCw,
  Send,
  UsersRound,
  X,
  XCircle
} from "lucide-react";
import type { Area, Locality, Position, Project, Role, StaffingRequest, WorkspaceMember } from "../types";
import { formatDate } from "../lib/format";

type ManagementViewProps = {
  staffingRequests: StaffingRequest[];
  projects: Project[];
  members: WorkspaceMember[];
  areas: Area[];
  localities: Locality[];
  positions: Position[];
  roles: Role[];
  currentAreaId?: string;
  isLoading: boolean;
  onRefresh: () => void;
  onCreateStaffingRequest: (input: {
    projectId: string;
    targetAreaId: string;
    targetLocalityId?: string;
    positionId?: string;
    roleId?: string;
    requestedUserId?: string;
    quantity: number;
    note?: string;
  }) => Promise<void>;
  onApproveStaffingRequest: (input: {
    requestId: string;
    approvedUserIds: string[];
    responseNote?: string;
  }) => Promise<void>;
  onRejectStaffingRequest: (input: {
    requestId: string;
    responseNote?: string;
  }) => Promise<void>;
};

function readFormString(form: HTMLFormElement, fieldName: string) {
  const value = new FormData(form).get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

function readFormStringList(form: HTMLFormElement, fieldName: string) {
  return new FormData(form)
    .getAll(fieldName)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function statusLabel(status: StaffingRequest["status"]) {
  const labels: Record<StaffingRequest["status"], string> = {
    PENDING: "Pendiente",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
    CANCELLED: "Cancelada"
  };

  return labels[status];
}

function memberLabel(member: WorkspaceMember) {
  return `${member.user.name} · ${member.position?.name ?? "Sin puesto"} · ${member.locality?.name ?? "Sin localidad"}`;
}

export function ManagementView({
  staffingRequests,
  projects,
  members,
  areas,
  localities,
  positions,
  roles,
  currentAreaId,
  isLoading,
  onRefresh,
  onCreateStaffingRequest,
  onApproveStaffingRequest,
  onRejectStaffingRequest
}: ManagementViewProps) {
  const [selectedTargetAreaId, setSelectedTargetAreaId] = useState("");
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const incomingRequests = useMemo(
    () => staffingRequests.filter((request) => currentAreaId && request.targetAreaId === currentAreaId),
    [staffingRequests, currentAreaId]
  );
  const outgoingRequests = useMemo(
    () => staffingRequests.filter((request) => !currentAreaId || request.targetAreaId !== currentAreaId),
    [staffingRequests, currentAreaId]
  );
  const pendingRequests = staffingRequests.filter((request) => request.status === "PENDING");
  const approvedRequests = staffingRequests.filter((request) => request.status === "APPROVED");
  const targetPositions = selectedTargetAreaId
    ? positions.filter((position) => position.areaId === selectedTargetAreaId)
    : positions;
  const targetLocalities = selectedTargetAreaId
    ? localities.filter((locality) => locality.areaId === selectedTargetAreaId)
    : localities;

  function candidatesForRequest(request: StaffingRequest) {
    return members.filter((member) =>
      member.status === "ACTIVE" &&
      member.areaId === request.targetAreaId &&
      (!request.targetLocalityId || member.localityId === request.targetLocalityId)
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const form = event.currentTarget;
      const note = readFormString(form, "note");
      const targetLocalityId = readFormString(form, "targetLocalityId");
      const positionId = readFormString(form, "positionId");
      const roleId = readFormString(form, "roleId");
      const requestedUserId = readFormString(form, "requestedUserId");
      await onCreateStaffingRequest({
        projectId: readFormString(form, "projectId"),
        targetAreaId: readFormString(form, "targetAreaId"),
        targetLocalityId: targetLocalityId || undefined,
        positionId: positionId || undefined,
        roleId: roleId || undefined,
        requestedUserId: requestedUserId || undefined,
        quantity: Number(readFormString(form, "quantity") || 1),
        note: note || undefined
      });
      form.reset();
      setSelectedTargetAreaId("");
      setIsRequestModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear la solicitud.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApprove(event: FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault();
    setErrorMessage("");

    try {
      const form = event.currentTarget;
      const responseNote = readFormString(form, "responseNote");
      const approvedUserIds = readFormStringList(form, "approvedUserIds");
      await onApproveStaffingRequest({
        requestId,
        approvedUserIds,
        responseNote: responseNote || undefined
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo aprobar la solicitud.");
    }
  }

  async function handleReject(event: FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault();
    setErrorMessage("");

    try {
      const form = event.currentTarget;
      const responseNote = readFormString(form, "responseNote");
      await onRejectStaffingRequest({
        requestId,
        responseNote: responseNote || undefined
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo rechazar la solicitud.");
    }
  }

  function renderRequestCard(request: StaffingRequest, mode: "incoming" | "outgoing") {
    const candidates = candidatesForRequest(request);

    return (
      <article className={`staffing-card staffing-card-pro status-border-${request.status.toLowerCase()}`} key={request.id}>
        <header>
          <div>
            <strong>{request.project.name}</strong>
            <small>{request.targetArea.name}{request.targetLocality ? ` · ${request.targetLocality.name}` : ""}</small>
          </div>
          <em className={`status-pill status-${request.status.toLowerCase()}`}>{statusLabel(request.status)}</em>
        </header>

        <div className="request-meta-grid">
          <span>
            <small>Cantidad</small>
            <strong>{request.quantity}</strong>
          </span>
          <span>
            <small>Puesto</small>
            <strong>{request.position?.name ?? "Sin especificar"}</strong>
          </span>
          <span>
            <small>Rol</small>
            <strong>{request.role?.name ?? "Rol del proyecto"}</strong>
          </span>
        </div>

        <p className="muted">{request.note || request.responseNote || "Sin nota registrada."}</p>
        <small>
          {mode === "incoming" ? `Solicita ${request.requester.name}` : "Solicitud enviada"} · {formatDate(request.createdAt)}
        </small>

        {request.assignments.length > 0 ? (
          <div className="assignment-list">
            {request.assignments.map((assignment) => (
              <span key={assignment.id}>{assignment.user.name}</span>
            ))}
          </div>
        ) : undefined}

        {request.status === "PENDING" && mode === "incoming" ? (
          <div className="staffing-actions">
            <form className="approval-form staffing-response" onSubmit={(event) => void handleApprove(event, request.id)}>
              <label>
                Personal disponible
                <select name="approvedUserIds" multiple required>
                  {candidates.map((member) => (
                    <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>
                  ))}
                </select>
              </label>
              <label>
                Nota
                <input name="responseNote" placeholder="Nota de aprobacion" />
              </label>
              <button className="primary-action" type="submit" disabled={candidates.length === 0}>
                <CheckCircle2 size={17} />
                Aceptar
              </button>
            </form>
            <form className="approval-form staffing-response" onSubmit={(event) => void handleReject(event, request.id)}>
              <label>
                Motivo
                <input name="responseNote" placeholder="Motivo opcional" />
              </label>
              <button className="secondary-action" type="submit">
                <XCircle size={17} />
                Rechazar
              </button>
            </form>
          </div>
        ) : undefined}
      </article>
    );
  }

  return (
    <section className="page management-page">
      <header className="page-heading management-hero">
        <div>
          <p className="eyebrow">Gerencia</p>
          <h1>Solicitudes entre areas</h1>
          <p className="hero-copy">Pide apoyo a otra area, acepta personal disponible y deja rastro de cada decision.</p>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={onRefresh}>
            <RefreshCw size={17} />
            Actualizar
          </button>
          <button className="primary-action" type="button" data-guide="management-new-request" onClick={() => setIsRequestModalOpen(true)}>
            <Plus size={18} />
            Nueva solicitud
          </button>
        </div>
      </header>

      {errorMessage ? <p className="form-error">{errorMessage}</p> : undefined}

      <section className="staffing-summary-grid" data-guide="management-stats">
        <article>
          <span><ArrowDownToLine size={18} /></span>
          <small>Entrantes</small>
          <strong>{incomingRequests.length}</strong>
        </article>
        <article>
          <span><ArrowUpRight size={18} /></span>
          <small>Enviadas</small>
          <strong>{outgoingRequests.length}</strong>
        </article>
        <article>
          <span><Clock3 size={18} /></span>
          <small>Pendientes</small>
          <strong>{pendingRequests.length}</strong>
        </article>
        <article>
          <span><ClipboardCheck size={18} /></span>
          <small>Aprobadas</small>
          <strong>{approvedRequests.length}</strong>
        </article>
      </section>

      <section className="management-flow">
        <article>
          <strong>1</strong>
          <span>Solicita apoyo con proyecto, area destino y puesto.</span>
        </article>
        <article>
          <strong>2</strong>
          <span>El gerente destino valida disponibilidad real.</span>
        </article>
        <article>
          <strong>3</strong>
          <span>Al aprobar, las personas quedan ligadas al proyecto.</span>
        </article>
      </section>

      <section className="management-board">
        <section className="request-lane" data-guide="management-incoming">
          <header>
            <h2><ArrowDownToLine size={18} /> Entrantes</h2>
            <span>{incomingRequests.length}</span>
          </header>
          {isLoading ? <div className="empty-state">Cargando solicitudes...</div> : undefined}
          {incomingRequests.map((request) => renderRequestCard(request, "incoming"))}
          {!isLoading && incomingRequests.length === 0 ? <div className="empty-state">No hay solicitudes entrantes.</div> : undefined}
        </section>

        <section className="request-lane" data-guide="management-outgoing">
          <header>
            <h2><Send size={18} /> Enviadas y visibles</h2>
            <span>{outgoingRequests.length}</span>
          </header>
          {outgoingRequests.map((request) => renderRequestCard(request, "outgoing"))}
          {!isLoading && outgoingRequests.length === 0 ? <div className="empty-state">No hay solicitudes enviadas.</div> : undefined}
        </section>
      </section>

      {isRequestModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="task-modal admin-modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <p className="eyebrow">Solicitud</p>
                <h2>Solicitar apoyo</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsRequestModalOpen(false)} aria-label="Cerrar modal">
                <X size={18} />
              </button>
            </header>

            <form className="form-stack admin-modal-form" onSubmit={handleCreate}>
              <label>
                Proyecto
                <select name="projectId" required defaultValue="">
                  <option value="">Seleccionar</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Area destino
                <select
                  name="targetAreaId"
                  required
                  value={selectedTargetAreaId}
                  onChange={(event) => setSelectedTargetAreaId(event.currentTarget.value)}
                >
                  <option value="">Seleccionar</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Localidad destino
                <select name="targetLocalityId" key={selectedTargetAreaId} defaultValue="">
                  <option value="">Cualquier localidad</option>
                  {targetLocalities.map((locality) => (
                    <option key={locality.id} value={locality.id}>{locality.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Puesto requerido
                <select name="positionId" key={selectedTargetAreaId} defaultValue="">
                  <option value="">Sin puesto especifico</option>
                  {targetPositions.map((position) => (
                    <option key={position.id} value={position.id}>{position.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Rol en proyecto
                <select name="roleId" defaultValue="">
                  <option value="">Rol del usuario</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad
                <input name="quantity" type="number" min={1} max={25} defaultValue={1} />
              </label>
              <label>
                Persona especifica
                <select name="requestedUserId" defaultValue="">
                  <option value="">Sin persona especifica</option>
                  {members
                    .filter((member) => !selectedTargetAreaId || member.areaId === selectedTargetAreaId)
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>
                    ))}
                </select>
              </label>
              <label className="wide-field">
                Nota
                <textarea name="note" rows={4} placeholder="Contexto del apoyo solicitado" />
              </label>
              <div className="modal-actions">
                <button className="secondary-action" type="button" onClick={() => setIsRequestModalOpen(false)}>
                  Cancelar
                </button>
                <button className="primary-action" type="submit" disabled={isSubmitting}>
                  <Send size={18} />
                  {isSubmitting ? "Solicitando..." : "Crear solicitud"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : undefined}
    </section>
  );
}
