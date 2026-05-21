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
  canAnswerAllRequests: boolean;
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
  const localityNames = [
    ...(member.locality?.name ? [member.locality.name] : []),
    ...(member.localityScopes?.map((scope) => scope.locality.name) ?? [])
  ];
  const uniqueLocalityNames = [...new Set(localityNames)];

  return `${member.user.name} · ${member.position?.name ?? "Sin puesto"} · ${uniqueLocalityNames.join(", ") || "Sin localidad"}`;
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
  canAnswerAllRequests,
  isLoading,
  onRefresh,
  onCreateStaffingRequest,
  onApproveStaffingRequest,
  onRejectStaffingRequest
}: ManagementViewProps) {
  const [selectedTargetAreaId, setSelectedTargetAreaId] = useState("");
  const [selectedTargetLocalityId, setSelectedTargetLocalityId] = useState("");
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
  const closedRequests = staffingRequests.filter((request) => request.status !== "PENDING");
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
      memberMatchesLocality(member, request.targetLocalityId)
    );
  }

  function memberMatchesLocality(member: WorkspaceMember, localityId?: string) {
    if (!localityId) {
      return true;
    }

    return member.localityId === localityId || Boolean(member.localityScopes?.some((scope) => scope.localityId === localityId));
  }

  function requestTargetLabel(request: StaffingRequest) {
    const localityName = request.targetLocality?.name ?? "Cualquier localidad";
    const positionName = request.position?.name ?? "Sin puesto especifico";
    const requestedName = request.requestedUser?.name ? ` · ${request.requestedUser.name}` : "";

    return `${request.targetArea.name} · ${localityName} · ${positionName}${requestedName}`;
  }

  function requestAssignmentsLabel(request: StaffingRequest) {
    if (request.assignments.length === 0) {
      return "Sin personas asignadas";
    }

    return request.assignments.map((assignment) => assignment.user.name).join(", ");
  }

  function canAnswerRequest(request: StaffingRequest) {
    return canAnswerAllRequests || Boolean(currentAreaId && request.targetAreaId === currentAreaId);
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
      setSelectedTargetLocalityId("");
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
        responseNote
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo rechazar la solicitud.");
    }
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

      <section className="staffing-table-card" data-guide="management-incoming">
        <header>
          <div>
            <h2><ArrowDownToLine size={18} /> Pendientes por responder</h2>
            <p>Solicitudes abiertas, ligadas siempre a un proyecto concreto.</p>
          </div>
          <span>{pendingRequests.length}</span>
        </header>
        {isLoading ? <div className="empty-state">Cargando solicitudes...</div> : undefined}
        {!isLoading && pendingRequests.length === 0 ? <div className="empty-state">No hay solicitudes pendientes.</div> : undefined}
        {pendingRequests.length > 0 ? (
          <div className="staffing-table" role="table" aria-label="Solicitudes pendientes">
            <div className="staffing-table-head" role="row">
              <span>Proyecto</span>
              <span>Solicitud</span>
              <span>Solicita</span>
              <span>Fecha</span>
              <span>Respuesta</span>
            </div>
            {pendingRequests.map((request) => {
              const candidates = candidatesForRequest(request);
              const canAnswer = canAnswerRequest(request);

              return (
                <article className="staffing-table-row" role="row" key={request.id}>
                  <div>
                    <strong>{request.project.name}</strong>
                    <small>{request.project.area?.name ?? "Sin area"} · {request.project.locality?.name ?? "Sin localidad"}</small>
                  </div>
                  <div>
                    <strong>{requestTargetLabel(request)}</strong>
                    <small>{request.quantity} persona{request.quantity === 1 ? "" : "s"} · {request.role?.name ?? "Rol original"}</small>
                    {request.note ? <p>{request.note}</p> : undefined}
                  </div>
                  <div>
                    <strong>{request.requester.name}</strong>
                    <small>{request.sourceArea?.name ?? "Sin area origen"}</small>
                  </div>
                  <div>
                    <strong>{formatDate(request.createdAt)}</strong>
                    <em className="status-pill status-pending">{statusLabel(request.status)}</em>
                  </div>
                  <div className="staffing-table-actions">
                    {canAnswer ? (
                      <>
                        <form className="staffing-inline-form" onSubmit={(event) => void handleApprove(event, request.id)}>
                          <select name="approvedUserIds" multiple required aria-label="Personal disponible">
                            {candidates.map((member) => (
                              <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>
                            ))}
                          </select>
                          <input name="responseNote" placeholder="Nota de aprobacion" />
                          <button className="primary-action compact-action" type="submit" disabled={candidates.length === 0}>
                            <CheckCircle2 size={16} />
                            Aprobar
                          </button>
                        </form>
                        <form className="staffing-inline-form" onSubmit={(event) => void handleReject(event, request.id)}>
                          <input name="responseNote" placeholder="Motivo de rechazo" minLength={2} required />
                          <button className="secondary-action compact-action danger-soft" type="submit">
                            <XCircle size={16} />
                            Rechazar
                          </button>
                        </form>
                      </>
                    ) : (
                      <span className="muted">Esperando al gerente del area destino.</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : undefined}
      </section>

      <section className="staffing-table-card" data-guide="management-outgoing">
        <header>
          <div>
            <h2><ClipboardCheck size={18} /> Historial aprobado y rechazado</h2>
            <p>Decisiones cerradas con personas asignadas o motivo de rechazo.</p>
          </div>
          <span>{closedRequests.length}</span>
        </header>
        {closedRequests.length === 0 ? <div className="empty-state">Aun no hay solicitudes cerradas.</div> : undefined}
        {closedRequests.length > 0 ? (
          <div className="staffing-table staffing-table-history" role="table" aria-label="Historial de solicitudes">
            <div className="staffing-table-head" role="row">
              <span>Proyecto</span>
              <span>Resultado</span>
              <span>Personal</span>
              <span>Respondio</span>
              <span>Motivo o nota</span>
            </div>
            {closedRequests.map((request) => (
              <article className="staffing-table-row" role="row" key={request.id}>
                <div>
                  <strong>{request.project.name}</strong>
                  <small>{requestTargetLabel(request)}</small>
                </div>
                <div>
                  <em className={`status-pill status-${request.status.toLowerCase()}`}>{statusLabel(request.status)}</em>
                  <small>{request.respondedAt ? formatDate(request.respondedAt) : "Sin fecha de cierre"}</small>
                </div>
                <div>
                  <strong>{requestAssignmentsLabel(request)}</strong>
                  <small>{request.quantity} solicitado{request.quantity === 1 ? "" : "s"}</small>
                </div>
                <div>
                  <strong>{request.responder?.name ?? "Sin responsable"}</strong>
                  <small>{request.targetArea.name}</small>
                </div>
                <p>{request.responseNote || request.note || "Sin nota registrada."}</p>
              </article>
            ))}
          </div>
        ) : undefined}
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
                  onChange={(event) => {
                    setSelectedTargetAreaId(event.currentTarget.value);
                    setSelectedTargetLocalityId("");
                  }}
                >
                  <option value="">Seleccionar</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Localidad destino
                <select
                  name="targetLocalityId"
                  key={selectedTargetAreaId}
                  value={selectedTargetLocalityId}
                  onChange={(event) => setSelectedTargetLocalityId(event.currentTarget.value)}
                >
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
                    .filter((member) =>
                      (!selectedTargetAreaId || member.areaId === selectedTargetAreaId) &&
                      memberMatchesLocality(member, selectedTargetLocalityId || undefined)
                    )
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
