import { FormEvent, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  Check,
  ClipboardList,
  MailPlus,
  MapPin,
  Network,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";
import type { Area, Locality, Position, Project, Role, UserType, WorkspaceMember } from "../types";
import { initials } from "../lib/format";

type MembersViewProps = {
  members: WorkspaceMember[];
  pendingMembers: WorkspaceMember[];
  roles: Role[];
  areas: Area[];
  localities: Locality[];
  positions: Position[];
  projects: Project[];
  isLoading: boolean;
  onRefresh: () => void;
  onInviteUser: (input: {
    email: string;
    userType: UserType;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    projectId?: string;
    expiresInDays: number;
  }) => Promise<string>;
  onCreateArea: (input: { name: string; description?: string }) => Promise<void>;
  onCreateLocality: (input: { areaId?: string; name: string; code: string; description?: string }) => Promise<void>;
  onCreatePosition: (input: {
    areaId?: string;
    name: string;
    description?: string;
    isManager: boolean;
  }) => Promise<void>;
  onApproveMember: (input: {
    memberId: string;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    userType?: UserType;
  }) => Promise<void>;
  onUpdateMember: (input: {
    memberId: string;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    userType?: UserType;
  }) => Promise<void>;
};

type MembersPanel = "directory" | "structure" | "pending";
type MembersModal = "none" | "invite" | "area" | "locality" | "position" | "edit-member";

function readFormString(form: HTMLFormElement, fieldName: string) {
  const value = new FormData(form).get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

function readFormStringList(form: HTMLFormElement, fieldName: string) {
  return new FormData(form)
    .getAll(fieldName)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

function readFormBoolean(form: HTMLFormElement, fieldName: string) {
  return new FormData(form).get(fieldName) === "on";
}

function positionsForArea(positions: Position[], areaId: string) {
  return areaId ? positions.filter((position) => position.areaId === areaId) : positions;
}

function localitiesForArea(localities: Locality[], areaId: string) {
  return areaId ? localities.filter((locality) => locality.areaId === areaId) : localities;
}

function memberLocalityScopeText(member: WorkspaceMember) {
  const scopedLocalities = member.localityScopes?.map((scope) => scope.locality.name) ?? [];

  if (scopedLocalities.length > 1) {
    return `Alcance: ${scopedLocalities.join(", ")}`;
  }

  return member.locality?.name ?? scopedLocalities[0] ?? "Sin localidad";
}

function roleTone(roleName: string) {
  const normalizedRole = roleName.toLowerCase();

  if (normalizedRole.includes("admin")) return "role-admin";
  if (normalizedRole.includes("gerente")) return "role-manager";
  if (normalizedRole.includes("developer")) return "role-dev";
  if (normalizedRole.includes("externo")) return "role-external";
  return "role-default";
}

export function MembersView({
  members,
  pendingMembers,
  roles,
  areas,
  localities,
  positions,
  projects,
  isLoading,
  onRefresh,
  onInviteUser,
  onCreateArea,
  onCreateLocality,
  onCreatePosition,
  onApproveMember,
  onUpdateMember
}: MembersViewProps) {
  const [activePanel, setActivePanel] = useState<MembersPanel>("directory");
  const [activeModal, setActiveModal] = useState<MembersModal>("none");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteAreaId, setInviteAreaId] = useState("");
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember>();
  const [editAreaId, setEditAreaId] = useState("");
  const [localityAreaId, setLocalityAreaId] = useState("");
  const [positionAreaId, setPositionAreaId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [isSavingStructure, setIsSavingStructure] = useState(false);

  const invitePositions = positionsForArea(positions, inviteAreaId);
  const inviteLocalities = localitiesForArea(localities, inviteAreaId);
  const selectedMemberAreaId = editAreaId || selectedMember?.areaId || "";
  const selectedMemberPositions = positionsForArea(positions, selectedMemberAreaId);
  const selectedMemberLocalities = localitiesForArea(localities, selectedMemberAreaId);
  const newLocalityAreaId = localityAreaId || areas[0]?.id || "";
  const newPositionAreaId = positionAreaId || areas[0]?.id || "";
  const activeMembers = useMemo(() => members.filter((member) => member.status === "ACTIVE"), [members]);

  function closeModal() {
    setActiveModal("none");
    setSelectedMember(undefined);
    setEditAreaId("");
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteToken("");
    setErrorMessage("");
    setIsInviting(true);

    try {
      const form = event.currentTarget;
      const roleId = readFormString(form, "roleId");
      const areaId = readFormString(form, "areaId");
      const localityIds = readFormStringList(form, "localityIds");
      const localityId = localityIds[0] ?? "";
      const positionId = readFormString(form, "positionId");
      const projectId = readFormString(form, "projectId");
      const token = await onInviteUser({
        email: readFormString(form, "email"),
        userType: readFormString(form, "userType") === "EXTERNAL" ? "EXTERNAL" : "INTERNAL",
        roleId: roleId || undefined,
        areaId: areaId || undefined,
        localityId: localityId || undefined,
        localityIds: localityIds.length > 0 ? localityIds : undefined,
        positionId: positionId || undefined,
        projectId: projectId || undefined,
        expiresInDays: Number(readFormString(form, "expiresInDays") || 7)
      });

      setInviteToken(token);
      form.reset();
      setInviteAreaId("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo invitar al usuario.");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleCreateArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSavingStructure(true);

    try {
      const form = event.currentTarget;
      const description = readFormString(form, "description");
      await onCreateArea({
        name: readFormString(form, "name"),
        description: description || undefined
      });
      form.reset();
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear el area.");
    } finally {
      setIsSavingStructure(false);
    }
  }

  async function handleCreateLocality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSavingStructure(true);

    try {
      const form = event.currentTarget;
      const description = readFormString(form, "description");
      await onCreateLocality({
        areaId: readFormString(form, "areaId") || undefined,
        name: readFormString(form, "name"),
        code: readFormString(form, "code"),
        description: description || undefined
      });
      form.reset();
      setLocalityAreaId("");
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear la localidad.");
    } finally {
      setIsSavingStructure(false);
    }
  }

  async function handleCreatePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSavingStructure(true);

    try {
      const form = event.currentTarget;
      const description = readFormString(form, "description");
      await onCreatePosition({
        areaId: readFormString(form, "areaId") || undefined,
        name: readFormString(form, "name"),
        description: description || undefined,
        isManager: readFormBoolean(form, "isManager")
      });
      form.reset();
      setPositionAreaId("");
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear el puesto.");
    } finally {
      setIsSavingStructure(false);
    }
  }

  async function handleApproveMember(event: FormEvent<HTMLFormElement>, memberId: string) {
    event.preventDefault();
    setErrorMessage("");

    try {
      const form = event.currentTarget;
      const roleId = readFormString(form, "roleId");
      const areaId = readFormString(form, "areaId");
      const localityIds = readFormStringList(form, "localityIds");
      const localityId = localityIds[0] ?? "";
      const positionId = readFormString(form, "positionId");
      await onApproveMember({
        memberId,
        roleId: roleId || undefined,
        areaId: areaId || undefined,
        localityId: localityId || undefined,
        localityIds: localityIds.length > 0 ? localityIds : undefined,
        positionId: positionId || undefined,
        userType: readFormString(form, "userType") === "EXTERNAL" ? "EXTERNAL" : "INTERNAL"
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo aprobar al usuario.");
    }
  }

  async function handleUpdateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!selectedMember) {
      return;
    }

    try {
      const form = event.currentTarget;
      const roleId = readFormString(form, "roleId");
      const areaId = readFormString(form, "areaId");
      const localityIds = readFormStringList(form, "localityIds");
      const localityId = localityIds[0] ?? "";
      const positionId = readFormString(form, "positionId");
      await onUpdateMember({
        memberId: selectedMember.id,
        roleId: roleId || undefined,
        areaId: areaId || undefined,
        localityId: localityId || undefined,
        localityIds: localityIds.length > 0 ? localityIds : undefined,
        positionId: positionId || undefined,
        userType: readFormString(form, "userType") === "EXTERNAL" ? "EXTERNAL" : "INTERNAL"
      });
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo actualizar el miembro.");
    }
  }

  return (
    <section className="page members-page">
      <header className="page-heading members-hero">
        <div>
          <p className="eyebrow">Miembros</p>
          <h1>Personas, areas y accesos</h1>
          <p className="hero-copy">Administra estructura, invitaciones y aprobaciones sin mezclar permisos con trabajo operativo.</p>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={onRefresh}>
            <RefreshCw size={17} />
            Actualizar
          </button>
          <button className="primary-action" type="button" onClick={() => setActiveModal("invite")}>
            <UserPlus size={18} />
            Invitar
          </button>
        </div>
      </header>

      {errorMessage ? <p className="form-error">{errorMessage}</p> : undefined}

      <section className="admin-overview admin-overview-rich">
        <article>
          <Building2 size={18} />
          <span>Areas</span>
          <strong>{areas.length}</strong>
        </article>
        <article>
          <MapPin size={18} />
          <span>Localidades</span>
          <strong>{localities.length}</strong>
        </article>
        <article>
          <BriefcaseBusiness size={18} />
          <span>Puestos</span>
          <strong>{positions.length}</strong>
        </article>
        <article>
          <UsersRound size={18} />
          <span>Activos</span>
          <strong>{activeMembers.length}</strong>
        </article>
        <article>
          <UserCheck size={18} />
          <span>Pendientes</span>
          <strong>{pendingMembers.length}</strong>
        </article>
      </section>

      <section className="member-command-grid">
        <button className="command-card command-primary" type="button" onClick={() => setActiveModal("invite")}>
          <span><MailPlus size={20} /></span>
          <strong>Invitar usuario</strong>
          <small>Interno, externo, gerente o lider con area y puesto.</small>
        </button>
        <button className="command-card" type="button" onClick={() => setActiveModal("area")}>
          <span><Building2 size={20} /></span>
          <strong>Nueva area</strong>
          <small>Define el departamento que podra tener gerencia.</small>
        </button>
        <button className="command-card" type="button" onClick={() => setActiveModal("locality")}>
          <span><MapPin size={20} /></span>
          <strong>Nueva localidad</strong>
          <small>Conecta area con ciudad, sucursal o zona.</small>
        </button>
        <button className="command-card" type="button" onClick={() => setActiveModal("position")}>
          <span><BriefcaseBusiness size={20} /></span>
          <strong>Nuevo puesto</strong>
          <small>Marca si puede aprobar personal del area.</small>
        </button>
      </section>

      <section className="control-tabs" aria-label="Vistas de miembros">
        <button className={activePanel === "directory" ? "active" : ""} type="button" onClick={() => setActivePanel("directory")}>
          <UsersRound size={16} />
          Directorio
        </button>
        <button className={activePanel === "structure" ? "active" : ""} data-guide="members-structure-tab" type="button" onClick={() => setActivePanel("structure")}>
          <Network size={16} />
          Estructura
        </button>
        <button className={activePanel === "pending" ? "active" : ""} data-guide="members-pending-tab" type="button" onClick={() => setActivePanel("pending")}>
          <ClipboardList size={16} />
          Pendientes
          {pendingMembers.length > 0 ? <span>{pendingMembers.length}</span> : undefined}
        </button>
      </section>

      {activePanel === "directory" ? (
        <section className="people-shell">
          <section className="people-grid">
            {isLoading ? <div className="empty-state">Cargando miembros...</div> : undefined}
            {members.map((member) => {
              const roleName = member.role?.name ?? "Sin rol";

              return (
                <article className="member-card member-card-pro" key={member.id}>
                  <span>{initials(member.user.name)}</span>
                  <div>
                    <strong>{member.user.name}</strong>
                    <small>{member.user.email}</small>
                    <small>{member.area?.name ?? "Sin area"} · {memberLocalityScopeText(member)} · {member.position?.name ?? "Sin puesto"}</small>
                  </div>
                  <em>{member.userType}</em>
                  <strong className={`member-role ${roleTone(roleName)}`}><ShieldCheck size={14} /> {roleName}</strong>
                  <button
                    className="ghost-button member-edit-button"
                    type="button"
                    onClick={() => {
                      setSelectedMember(member);
                      setEditAreaId(member.areaId ?? "");
                      setActiveModal("edit-member");
                    }}
                  >
                    Editar
                  </button>
                </article>
              );
            })}
            {!isLoading && members.length === 0 ? <div className="empty-state">Sin miembros visibles.</div> : undefined}
          </section>
        </section>
      ) : undefined}

      {activePanel === "structure" ? (
        <section className="structure-map">
          {areas.map((area) => {
            const areaLocalities = localitiesForArea(localities, area.id);
            const areaPositions = positionsForArea(positions, area.id);
            const areaMembers = members.filter((member) => member.areaId === area.id).length;

            return (
              <article className="structure-card structure-card-pro" key={area.id}>
                <header>
                  <div>
                    <strong>{area.name}</strong>
                    <small>{areaMembers} miembro(s) · {areaLocalities.length} localidad(es)</small>
                  </div>
                  {area.isDefault ? <em>Default</em> : undefined}
                </header>
                <div className="structure-columns">
                  <section>
                    <span><MapPin size={14} /> Localidades</span>
                    <p>{areaLocalities.map((locality) => locality.name).join(", ") || "Sin localidades"}</p>
                  </section>
                  <section>
                    <span><BriefcaseBusiness size={14} /> Puestos</span>
                    <p>{areaPositions.map((position) => position.name).join(", ") || "Sin puestos"}</p>
                  </section>
                </div>
              </article>
            );
          })}
          {areas.length === 0 ? <div className="empty-state">Crea la primera area para ordenar usuarios, puestos y localidades.</div> : undefined}
        </section>
      ) : undefined}

      {activePanel === "pending" ? (
        <section className="approval-panel approval-panel-pro">
          <h2><UserCheck size={18} /> Pendientes de aprobacion</h2>
          {pendingMembers.map((member) => (
            <article className="approval-card approval-card-pro" key={member.id}>
              <div className="member-card compact">
                <span>{initials(member.user.name)}</span>
                <div>
                  <strong>{member.user.name}</strong>
                  <small>{member.user.email}</small>
                  <small>{member.area?.name ?? "Sin area"} · {memberLocalityScopeText(member)} · {member.position?.name ?? "Sin puesto"}</small>
                </div>
                <em>{member.userType}</em>
              </div>
              <form className="approval-form" onSubmit={(event) => void handleApproveMember(event, member.id)}>
                <select name="roleId" defaultValue={member.roleId ?? ""}>
                  <option value="">Rol default</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                <select name="areaId" defaultValue={member.areaId ?? ""}>
                  <option value="">Area original</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
                <select name="localityIds" defaultValue={member.localityScopes?.map((scope) => scope.localityId) ?? (member.localityId ? [member.localityId] : [])} multiple>
                  {localitiesForArea(localities, member.areaId ?? "").map((locality) => (
                    <option key={locality.id} value={locality.id}>{locality.name}</option>
                  ))}
                </select>
                <select name="positionId" defaultValue={member.positionId ?? ""}>
                  <option value="">Puesto original</option>
                  {positionsForArea(positions, member.areaId ?? "").map((position) => (
                    <option key={position.id} value={position.id}>{position.name}</option>
                  ))}
                </select>
                <select name="userType" defaultValue={member.userType}>
                  <option value="INTERNAL">Interno</option>
                  <option value="EXTERNAL">Externo</option>
                </select>
                <button className="primary-action" type="submit">
                  <UserCheck size={17} />
                  Aprobar
                </button>
              </form>
            </article>
          ))}
          {!isLoading && pendingMembers.length === 0 ? <div className="empty-state">No hay registros pendientes por aprobar.</div> : undefined}
        </section>
      ) : undefined}

      {activeModal !== "none" ? (
        <div className="modal-backdrop" role="presentation">
          <section className="task-modal admin-modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <p className="eyebrow">{activeModal === "invite" || activeModal === "edit-member" ? "Acceso" : "Estructura"}</p>
                <h2>
                  {activeModal === "invite" ? "Invitar usuario" : undefined}
                  {activeModal === "edit-member" ? "Editar miembro" : undefined}
                  {activeModal === "area" ? "Crear area" : undefined}
                  {activeModal === "locality" ? "Crear localidad" : undefined}
                  {activeModal === "position" ? "Crear puesto" : undefined}
                </h2>
              </div>
              <button className="icon-button" type="button" onClick={closeModal} aria-label="Cerrar modal">
                <X size={18} />
              </button>
            </header>

            {activeModal === "invite" ? (
              <form className="form-stack admin-modal-form" onSubmit={handleInvite}>
                <label>
                  Correo
                  <input name="email" type="email" required placeholder="usuario@empresa.com" />
                </label>
                <label>
                  Tipo
                  <select name="userType" defaultValue="INTERNAL">
                    <option value="INTERNAL">Interno</option>
                    <option value="EXTERNAL">Externo</option>
                  </select>
                </label>
                <label>
                  Area
                  <small>Admin ve todas; gerente trabaja solamente con su area.</small>
                  <select name="areaId" value={inviteAreaId} onChange={(event) => setInviteAreaId(event.currentTarget.value)}>
                    <option value="">Mi area</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Localidades de alcance
                  <small>Para gerentes puedes elegir varias. Si no eliges, backend usa tu localidad permitida.</small>
                  <select name="localityIds" key={inviteAreaId} defaultValue={[]} multiple>
                    {inviteLocalities.map((locality) => (
                      <option key={locality.id} value={locality.id}>{locality.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Puesto
                  <small>Los puestos disponibles dependen del area seleccionada.</small>
                  <select name="positionId" key={inviteAreaId} defaultValue="">
                    <option value="">Sin puesto</option>
                    {invitePositions.map((position) => (
                      <option key={position.id} value={position.id}>{position.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Rol
                  <select name="roleId" defaultValue="">
                    <option value="">Rol default</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Proyecto para externo
                  <select name="projectId" defaultValue="">
                    <option value="">Sin proyecto</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Vigencia
                  <input name="expiresInDays" type="number" min={1} max={30} defaultValue={7} />
                </label>
                {inviteToken ? <p className="token-box">Token local: {inviteToken}</p> : undefined}
                <div className="modal-actions">
                  <button className="secondary-action" type="button" onClick={closeModal}>Cerrar</button>
                  <button className="primary-action" type="submit" disabled={isInviting}>
                    <MailPlus size={18} />
                    {isInviting ? "Invitando..." : "Enviar invitacion"}
                  </button>
                </div>
              </form>
            ) : undefined}

            {activeModal === "edit-member" && selectedMember ? (
              <form className="form-stack admin-modal-form" onSubmit={handleUpdateMember}>
                <div className="member-card compact wide-field">
                  <span>{initials(selectedMember.user.name)}</span>
                  <div>
                    <strong>{selectedMember.user.name}</strong>
                    <small>{selectedMember.user.email}</small>
                    <small>{memberLocalityScopeText(selectedMember)}</small>
                  </div>
                  <em>{selectedMember.userType}</em>
                </div>
                <label>
                  Rol
                  <select name="roleId" defaultValue={selectedMember.roleId ?? ""}>
                    <option value="">Rol default</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select name="userType" defaultValue={selectedMember.userType}>
                    <option value="INTERNAL">Interno</option>
                    <option value="EXTERNAL">Externo</option>
                  </select>
                </label>
                <label>
                  Area
                  <select
                    name="areaId"
                    value={selectedMemberAreaId}
                    onChange={(event) => setEditAreaId(event.currentTarget.value)}
                  >
                    <option value="">Sin area</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Localidades de alcance
                  <small>Un gerente puede tener varias localidades. Un colaborador normalmente usa solo una.</small>
                  <select
                    name="localityIds"
                    key={`${selectedMember.id}-${selectedMemberAreaId}`}
                    defaultValue={selectedMember.localityScopes?.map((scope) => scope.localityId) ?? (selectedMember.localityId ? [selectedMember.localityId] : [])}
                    multiple
                  >
                    {selectedMemberLocalities.map((locality) => (
                      <option key={locality.id} value={locality.id}>{locality.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Puesto
                  <select name="positionId" key={`${selectedMember.id}-${selectedMemberAreaId}-position`} defaultValue={selectedMember.positionId ?? ""}>
                    <option value="">Sin puesto</option>
                    {selectedMemberPositions.map((position) => (
                      <option key={position.id} value={position.id}>{position.name}</option>
                    ))}
                  </select>
                </label>
                <div className="modal-actions">
                  <button className="secondary-action" type="button" onClick={closeModal}>Cancelar</button>
                  <button className="primary-action" type="submit">
                    <Check size={17} />
                    Guardar accesos
                  </button>
                </div>
              </form>
            ) : undefined}

            {activeModal === "area" ? (
              <form className="form-stack admin-modal-form single" onSubmit={handleCreateArea}>
                <label>
                  Nombre
                  <input name="name" minLength={2} required placeholder="Operaciones" />
                </label>
                <label>
                  Descripcion
                  <textarea name="description" rows={4} placeholder="Responsabilidad principal del area" />
                </label>
                <div className="modal-actions">
                  <button className="secondary-action" type="button" onClick={closeModal}>Cancelar</button>
                  <button className="primary-action" type="submit" disabled={isSavingStructure}>
                    <Check size={17} />
                    Guardar area
                  </button>
                </div>
              </form>
            ) : undefined}

            {activeModal === "locality" ? (
              <form className="form-stack admin-modal-form single" onSubmit={handleCreateLocality}>
                <label>
                  Area
                  <small>Admin y Lider TI pueden crear localidades; el area queda ligada al catalogo.</small>
                  <select
                    name="areaId"
                    value={newLocalityAreaId}
                    onChange={(event) => setLocalityAreaId(event.currentTarget.value)}
                    required
                  >
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Nombre
                  <input name="name" minLength={2} required placeholder="Guadalajara" />
                </label>
                <label>
                  Codigo
                  <input name="code" minLength={2} required placeholder="GDL" />
                </label>
                <label>
                  Descripcion
                  <textarea name="description" rows={4} placeholder="Sucursal, ciudad o zona operativa" />
                </label>
                <div className="modal-actions">
                  <button className="secondary-action" type="button" onClick={closeModal}>Cancelar</button>
                  <button className="primary-action" type="submit" disabled={isSavingStructure}>
                    <Check size={17} />
                    Guardar localidad
                  </button>
                </div>
              </form>
            ) : undefined}

            {activeModal === "position" ? (
              <form className="form-stack admin-modal-form single" onSubmit={handleCreatePosition}>
                <label>
                  Area
                  <small>Gerentes solo pueden crear puestos para su propia area.</small>
                  <select
                    name="areaId"
                    value={newPositionAreaId}
                    onChange={(event) => setPositionAreaId(event.currentTarget.value)}
                    required
                  >
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Puesto
                  <input name="name" minLength={2} required placeholder="Gerente de operaciones" />
                </label>
                <label>
                  Descripcion
                  <textarea name="description" rows={4} placeholder="Alcance del puesto" />
                </label>
                <label className="inline-check">
                  <input name="isManager" type="checkbox" />
                  Puede aprobar personal
                </label>
                <div className="modal-actions">
                  <button className="secondary-action" type="button" onClick={closeModal}>Cancelar</button>
                  <button className="primary-action" type="submit" disabled={isSavingStructure}>
                    <Check size={17} />
                    Guardar puesto
                  </button>
                </div>
              </form>
            ) : undefined}
          </section>
        </div>
      ) : undefined}
    </section>
  );
}
