import { useState, type FormEvent } from 'react';
import { ArrowRight, Building2, Plus } from 'lucide-react';
import { Button, EmptyState, LoadingState } from './ui';
import { Dialog } from './ui/Dialog';
import { initials } from '../lib/format';
import { roleLabel } from '../lib/roles';
import type { WorkspaceListItem } from '../types';
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

export function WorkspaceSelect({workspaces,isLoading,canCreateWorkspace,onRefresh,onSelect,onCreateWorkspace,onGoToLogin}:WorkspaceSelectProps){
 const [creating,setCreating]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError('');const data=new FormData(event.currentTarget);const read=(key:string)=>String(data.get(key)??'').trim();try{await onCreateWorkspace({name:read('name'),defaultAreaName:read('area')||undefined,defaultLocalityName:read('locality')||undefined,defaultLocalityCode:read('code')||undefined});setCreating(false);}catch(failure){setError(failure instanceof Error?failure.message:'No se pudo crear la empresa.');}finally{setBusy(false);}}
 return <main className="day-workspaces"><header><span className="day-login-brand"><span>v</span>vianko<strong>day</strong></span><Button variant="ghost" onClick={onGoToLogin}>Cerrar sesión</Button></header><section><p className="day-kicker">Ya estás dentro</p><h1>¿Con qué equipo<br/>trabajamos hoy?</h1><p>Elige una empresa para entrar a tu trabajo.</p>{isLoading&&<LoadingState label="Cargando tus empresas…" rows={2}/>}<div className="day-workspace-list">{workspaces.map(workspace=><button key={workspace.id} onClick={()=>onSelect(workspace)}><span>{initials(workspace.name)}</span><div><strong>{workspace.name}</strong><small>{roleLabel(workspace.member.role)}{workspace.member.area&&` · ${workspace.member.area.name}`}</small></div><ArrowRight size={19}/></button>)}</div>{!isLoading&&!workspaces.length&&<EmptyState icon={<Building2 size={25}/>} title="Tu acceso está por comenzar" description="Abre el enlace de invitación que te compartió el responsable de tu empresa."/>}<footer>{canCreateWorkspace&&<Button variant="ghost" icon={<Plus size={16}/>} onClick={()=>{setError('');setCreating(true);}}>Crear empresa</Button>}<Button variant="ghost" onClick={onRefresh}>Actualizar accesos</Button></footer></section>
 {creating&&<Dialog title="Comienza un nuevo equipo" description="Crea la empresa y su primera área. Después podrás invitar personas." busy={busy} onClose={()=>setCreating(false)}><form className="product-form" onSubmit={submit}><label>Nombre de la empresa<input data-autofocus name="name" required minLength={2} maxLength={120} placeholder="Ej. Vianko Operaciones"/></label><label>Primera área<input name="area" defaultValue="Operaciones" minLength={2} maxLength={120}/></label><div className="form-two-columns"><label>Localidad inicial<input name="locality" required minLength={2} maxLength={120} placeholder="Ej. Guadalajara"/></label><label>Código de localidad<input name="code" required minLength={2} maxLength={24} placeholder="Ej. GDL"/></label></div><p className="scope-note">Tendrás el rol Administrador en esta empresa. Los accesos de otras empresas se conservan separados.</p>{error&&<p className="form-error" role="alert">{error}</p>}<footer className="product-form-actions"><Button disabled={busy} onClick={()=>setCreating(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={busy}>{busy?'Creando…':'Crear empresa'}</Button></footer></form></Dialog>}</main>;
}
