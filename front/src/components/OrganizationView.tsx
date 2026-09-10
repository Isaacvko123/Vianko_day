import { useState, type FormEvent } from 'react';
import { Building2, MapPin, Plus, BriefcaseBusiness, Pencil } from 'lucide-react';
import type { MembersViewProps } from './MembersView';
import { Button, EmptyState } from './ui';
import { Dialog } from './ui/Dialog';
import { apiRequest } from '../api/http';
import type { Area, Locality, Position } from '../types';
type Props = Pick<MembersViewProps, 'areas' | 'localities' | 'positions' | 'members' | 'workspacePermissions' | 'onCreateArea' | 'onCreateLocality' | 'onCreatePosition'> & { token: string; workspaceId: string; onSaved: () => Promise<void> }; 
export function OrganizationView({ token, workspaceId, onSaved, areas, localities, positions, members, workspacePermissions, onCreateArea, onCreateLocality, onCreatePosition }: Props) {
  const [areaId, setAreaId] = useState('');
  const [modal, setModal] = useState<'area' | 'locality' | 'position'>();
  const [editing, setEditing] = useState<Area | Locality | Position>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedArea = areas.find(area => area.id === areaId) ?? areas[0];
  const has = (key: string) => workspacePermissions.includes(key);
  function open(next: typeof modal, record?: Area | Locality | Position) { setEditing(record); setError(''); setModal(next); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const input = { name: String(form.get('name')).trim(), description: String(form.get('description') ?? '').trim() || undefined };
    try {
      if (editing) { await apiRequest(`/workspaces/${workspaceId}/organization/${modal === 'area' ? 'areas' : modal === 'locality' ? 'localities' : 'positions'}/${editing.id}`, { token, method: 'PATCH', body: { ...input, description: input.description ?? '', ...(modal === 'locality' ? { code: String(form.get('code')).trim() } : {}), expectedUpdatedAt: editing.updatedAt } }); await onSaved(); }
      else if (modal === 'area') await onCreateArea(input);
      else if (modal === 'locality') await onCreateLocality({ ...input, areaId: selectedArea?.id, code: String(form.get('code')).trim() });
      else await onCreatePosition({ ...input, areaId: selectedArea?.id, isManager: false });
      setModal(undefined);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return <section className="page product-page">
    <header className="product-heading"><div><p className="eyebrow">Administración</p><h1>Organización</h1><p>Ordena la empresa por áreas. Cada área reúne sus localidades, puestos y personas.</p></div>{has('area.manage') && <Button variant="primary" icon={<Plus size={17} />} onClick={() => open('area')}>Crear área</Button>}</header>
    <div className="organization-explainer"><span><Building2 size={18} /><strong>Área</strong> Equipo responsable</span><span><MapPin size={18} /><strong>Localidad</strong> Dónde trabaja</span><span><BriefcaseBusiness size={18} /><strong>Puesto</strong> Función de la persona</span></div>
    <div className="roles-workbench"><aside className="role-list" aria-label="Áreas">{areas.map(area => <button className={`role-choice ${selectedArea?.id === area.id ? 'selected' : ''}`} key={area.id} onClick={() => setAreaId(area.id)}><Building2 size={18} /><span><strong>{area.name}</strong><small>{members.filter(member => member.areaId === area.id && member.status === 'ACTIVE').length} personas</small></span></button>)}</aside>
      {selectedArea ? <article className="organization-detail"><header><div className="section-title"><h2>{selectedArea.name}</h2>{has("area.manage") && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => open("area", selectedArea)}>Editar área</Button>}</div><p>{selectedArea.description || 'Agrupa el trabajo y las personas de este equipo.'}</p></header>
        <section><div className="section-title"><h3><MapPin size={18} /> Localidades</h3>{has('locality.manage') && <Button size="sm" icon={<Plus size={15} />} onClick={() => open('locality')}>Agregar localidad</Button>}</div><p className="muted-note">Ciudades, sedes o zonas que delimitan dónde opera el área.</p><div className="organization-items">{localities.filter(item => item.areaId === selectedArea.id).map(item => <div key={item.id}><strong>{item.name}</strong><span className="subtle-tag">{item.code}</span>{has("locality.manage") && <button className="structure-edit" aria-label={`Editar localidad ${item.name}`} onClick={() => open("locality", item)}><Pencil size={14} /></button>}{item.description && <p>{item.description}</p>}</div>)}</div>{!localities.some(item => item.areaId === selectedArea.id) && <p className="inline-empty">Aún no hay localidades. Puedes trabajar con alcance a toda el área.</p>}</section>
        <section><div className="section-title"><h3><BriefcaseBusiness size={18} /> Puestos</h3>{has('position.manage') && <Button size="sm" icon={<Plus size={15} />} onClick={() => open('position')}>Agregar puesto</Button>}</div><p className="muted-note">Los puestos describen responsabilidades. Los permisos se asignan mediante un rol.</p><div className="organization-items">{positions.filter(item => item.areaId === selectedArea.id).map(item => <div key={item.id}><strong>{item.name}</strong>{has("position.manage") && <button className="structure-edit" aria-label={`Editar puesto ${item.name}`} onClick={() => open("position", item)}><Pencil size={14} /></button>}{item.description && <p>{item.description}</p>}</div>)}</div>{!positions.some(item => item.areaId === selectedArea.id) && <p className="inline-empty">Puedes agregar puestos cuando tu equipo los necesite.</p>}</section>
      </article> : <EmptyState title="Crea la primera área" description="Empieza con el equipo responsable del trabajo, por ejemplo Operaciones." />}
    </div>
    {modal && <Dialog title={editing ? (modal === 'area' ? 'Editar área' : modal === 'locality' ? 'Editar localidad' : 'Editar puesto') : modal === 'area' ? 'Crear área' : modal === 'locality' ? 'Agregar localidad' : 'Agregar puesto'} description={modal === 'area' ? 'Un área agrupa a las personas y proyectos de un equipo.' : `Área: ${selectedArea?.name}`} busy={busy} onClose={() => setModal(undefined)}><form className="product-form" onSubmit={submit}><label>Nombre<input name="name" defaultValue={editing?.name} data-autofocus required minLength={2} maxLength={120} placeholder={modal === 'area' ? 'Ej. Operaciones' : modal === 'locality' ? 'Ej. Guadalajara' : 'Ej. Analista de soporte'} /></label>{modal === 'locality' && <label>Código<input name="code" defaultValue={editing && "code" in editing ? editing.code : ""} required minLength={2} maxLength={24} placeholder="Ej. GDL" /></label>}<label>Descripción <span className="optional-label">Opcional</span><textarea name="description" defaultValue={editing?.description} maxLength={500} rows={3} /></label>{modal === 'position' && <p className="scope-note">Este puesto no concede permisos de administración ni de aprobación. Asigna un rol a la persona para definir sus acciones.</p>}{error && <p className="form-error" role="alert">{error}</p>}<footer className="product-form-actions"><Button disabled={busy} onClick={() => setModal(undefined)}>Cancelar</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : modal === 'area' ? 'Crear área' : modal === 'locality' ? 'Guardar localidad' : 'Guardar puesto'}</Button></footer></form></Dialog>}
  </section>;
}
