import { Dialog } from './ui/Dialog';
import { Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/http';
import type { TaskPerson } from './TaskComposer';
import { X, Search, Send, ChevronDown, UsersRound } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, GitBranch, MessageSquareText, PanelRightClose, Plus, ShieldAlert, TimerReset, Pencil, Check } from "lucide-react";
import { TaskEditor } from "./TaskEditor";
import { useDialog } from "../hooks/useDialog";
import { canMoveTask, isTaskDone, priorityLabels, taskStatusOptions } from "../lib/tasks";
import type { UpdateTaskInput } from "../api/endpoints";
import { Button, EmptyState, LoadingState } from "./ui";
import type { ActivityEvent, BoardStatus, ProjectMember, Task, TaskComment, TaskPriority, TimeLog, WorkspaceMember } from "../types";
import { formatDate, formatMinutes, getDueSummary, getRangeLabel, initials } from "../lib/format";

type TaskDetailPanelProps = {
  canDeleteTask?: boolean;
  onOpenChat?: () => void;
  connectionState: 'connecting' | 'live' | 'reconnecting';
  token: string;
  onReload: () => Promise<void>;
  task?: Task;
  subtasks: Task[];
  statuses: BoardStatus[];
  projectMembers: ProjectMember[];
  workspaceMembers: WorkspaceMember[];
  comments: TaskComment[];
  timeLogs: TimeLog[];
  events: ActivityEvent[];
  isLoading: boolean;
  currentUserId: string;
  canCreateSubtasks: boolean;
  canMoveClosedTasks: boolean;
  canViewPlanning: boolean;
  canEditPlanning: boolean;
  canModifyCompletedTask: boolean;
  canUpdateTasks: boolean;
  canUpdateProgress: boolean;
  canChangeTaskStatus: boolean;
  canUseInternalComments: boolean;
  onClose: () => void;
  onUpdateTaskPlan: (input: UpdateTaskInput) => Promise<void>;
  onCreateSubtask: (input: {
    title: string;
    description?: string;
    priority: TaskPriority;
    startAt?: string;
    dueAt?: string;
    estimateMinutes?: number;
    assigneeIds: string[];
  }) => Promise<void>;
  onSubtaskStatusChange: (taskId: string, statusId: string) => Promise<void>;
  onCreateSubtaskTimeLog: (taskId: string, minutes: number, note?: string) => Promise<void>;
  onAddTaskAssignee: (taskId: string, userId: string) => Promise<void>;
  onMentionTaskUser: (taskId: string, userId: string) => Promise<void>;
  onCreateComment: (body: string, isInternal: boolean) => Promise<void>;
  onCreateTimeLog: (minutes: number, note?: string) => Promise<void>;
};

type DetailTab = "summary" | "subtasks" | "activity" | "time";

type VisibleTimeLog = TimeLog & {
  sourceTitle: string;
};

function readFormString(form: HTMLFormElement, fieldName: string) {
  const value = new FormData(form).get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

function readFormStrings(form: HTMLFormElement, fieldName: string) {
  return new FormData(form)
    .getAll(fieldName)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function toIsoDate(dateValue: string) {
  return dateValue ? new Date(`${dateValue}T00:00:00.000Z`).toISOString() : undefined;
}

function getRemainingWorkLabel(estimateMinutes: number | undefined, loggedMinutes: number) {
  if (!estimateMinutes) {
    return "Falta estimar";
  }

  const remainingMinutes = estimateMinutes - loggedMinutes;

  if (remainingMinutes <= 0) {
    return "Estimado cubierto";
  }

  return `${formatMinutes(remainingMinutes)} restantes`;
}

function getTaskDoneState(task: Task, statuses: BoardStatus[]) {
  return isTaskDone(task, statuses);
}

function getTaskLoggedMinutes(task: Task) {
  return (task.timeLogs ?? []).reduce((sum, log) => sum + log.minutes, 0);
}

function getAssigneeNames(task: Task) {
  const names = (task.assignees ?? []).map((assignee) => assignee.user.name);
  return names.length > 0 ? names.join(", ") : "Sin asignados";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getStatusName(statuses: BoardStatus[], statusId: unknown) {
  return typeof statusId === "string"
    ? statuses.find((status) => status.id === statusId)?.name ?? "Estado desconocido"
    : "Estado desconocido";
}

function getChangedFieldLabel(fieldName: string) {
  const labels: Record<string, string> = {
    title: "titulo",
    description: "descripcion",
    priority: "prioridad",
    startAt: "fecha inicio",
    dueAt: "fecha fin",
    estimateMinutes: "estimado",
    progress: "avance"
  };

  return labels[fieldName] ?? fieldName;
}

function getEventText(event: ActivityEvent, statuses: BoardStatus[]) {
  const after = isRecord(event.after) ? event.after : {};
  const before = isRecord(event.before) ? event.before : {};

  switch (event.action) {
    case "task.created":
      return {
        title: "Actividad creada",
        description: "Se registro la actividad en el tablero."
      };
    case "task.updated": {
      const changedFields = Object.keys(after)
        .filter((fieldName) => after[fieldName] !== undefined)
        .map(getChangedFieldLabel);
      return {
        title: "Actividad modificada",
        description: changedFields.length > 0 ? `Cambios en ${changedFields.join(", ")}.` : "Se actualizaron datos de la actividad."
      };
    }
    case "task.status_changed":
      return {
        title: "Estado actualizado",
        description: `${getStatusName(statuses, before.statusId)} -> ${getStatusName(statuses, after.statusId)}.`
      };
    case "task.completed":
      return {
        title: "Actividad terminada",
        description: `Se movio a ${getStatusName(statuses, after.statusId)}.`
      };
    case "task.reopened":
      return {
        title: "Actividad reabierta",
        description: `Regreso a ${getStatusName(statuses, after.statusId)}.`
      };
    case "task.assigned":
      return {
        title: "Asignado agregado",
        description: "Se agrego una persona responsable."
      };
    case "task.unassigned":
      return {
        title: "Asignado removido",
        description: "Se quito una persona responsable."
      };
    case "comment.created":
      return {
        title: "Comentario agregado",
        description: after.isInternal === true ? "Se agrego un comentario interno." : "Se agrego un comentario visible."
      };
    case "time.logged":
      return {
        title: "Tiempo registrado",
        description: typeof after.minutes === "number" ? `Se registraron ${formatMinutes(after.minutes)}.` : "Se registro tiempo trabajado."
      };
    default:
      return {
        title: event.action,
        description: "Evento registrado en la actividad."
      };
  }
}

export function TaskDetailPanel(props: TaskDetailPanelProps) {
  const {task,subtasks,statuses,comments,timeLogs,events,token,onClose}=props;
  const [editing,setEditing]=useState(false);
  const [deleteVersion,setDeleteVersion]=useState<string>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [searchParams,setSearchParams]=useSearchParams();
  const [tab,setTab]=useState<'work'|'activity'>(()=>searchParams.get('tab')==='conversation'?'activity':'work');
  const scrollRef=useRef<HTMLDivElement>(null);
  const messagesEnd=useRef<HTMLDivElement>(null);
  const previousCount=useRef(0);
  const highlighted=useRef('');
  const [newMessages,setNewMessages]=useState(0);
  const [nearLatest,setNearLatest]=useState(true);
  const commentId=searchParams.get('comment');
  useEffect(()=>{ if(searchParams.get('tab')==='conversation')setTab('activity'); },[searchParams]);
  useEffect(()=>{
    if(tab!=='activity')return;
    if(commentId&&comments.some(item=>item.id===commentId)&&highlighted.current!==commentId){ document.getElementById(`message-${commentId}`)?.scrollIntoView({block:'center'});highlighted.current=commentId; }
    else if(comments.length>previousCount.current){
      if(nearLatest||previousCount.current===0)messagesEnd.current?.scrollIntoView({block:'end'});
      else setNewMessages(count=>count+comments.length-previousCount.current);
    }
    previousCount.current=comments.length;
  },[comments.length,tab,commentId,nearLatest]);
  function switchTab(value:'work'|'activity'){setTab(value);setNewMessages(0);const next=new URLSearchParams(searchParams);if(value==='activity')next.set('tab','conversation');else{next.delete('tab');next.delete('comment');}setSearchParams(next,{replace:true});}

  const [assignOpen,setAssignOpen]=useState(false);
  const [personSearch,setPersonSearch]=useState('');
  const [newSubtask,setNewSubtask]=useState('');
  const [comment,setComment]=useState('');
  const [internal,setInternal]=useState(false);
  const dialog=useDialog(Boolean(task),onClose,busy||editing);
  const people=useQuery({queryKey:['task-people',task?.projectId],queryFn:()=>apiRequest<{people:TaskPerson[]}>(`/projects/${task!.projectId}/task-people`,{token}),enabled:Boolean(task?.capabilities?.canAssign&&assignOpen)});
  async function act(action:()=>Promise<void>,message:string) { if(busy)return;setBusy(true);setError('');setNotice('');try{await action();setNotice(message);}catch(failure){setError(failure instanceof Error?failure.message:'No se pudo guardar el cambio.');}finally{setBusy(false);} }
  if(!task)return null;
  const caps=task.capabilities;
  const done=isTaskDone(task,statuses);
  const currentStatus=statuses.find(status=>status.id===task.statusId);
  const nextCategory=done?'IN_PROGRESS':currentStatus?.category==='TODO'?'IN_PROGRESS':currentStatus?.category==='REVIEW'?'DONE':'REVIEW';
  const nextStatus=statuses.find(status=>status.category===nextCategory&&caps?.allowedStatusIds.includes(status.id));
  const nextLabel=done?'Reabrir tarea':nextCategory==='IN_PROGRESS'?'Comenzar tarea':nextCategory==='DONE'?'Aprobar y terminar':'Enviar a revisión';
  const checked=subtasks.filter(item=>isTaskDone(item,statuses)).length;
  const minutes=timeLogs.reduce((sum,item)=>sum+item.minutes,0)+subtasks.reduce((sum,item)=>sum+getTaskLoggedMinutes(item),0);
  const candidates=(people.data?.people??[]).filter(person=>!task.assignees?.some(item=>item.userId===person.id)&&`${person.name} ${person.area??''}`.toLocaleLowerCase('es').includes(personSearch.toLocaleLowerCase('es')));
  return <div ref={dialog} className="day-task-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy&&!editing)onClose();}}><section className="day-task-drawer" role="dialog" aria-modal="true" aria-labelledby="day-task-title">
    <header className="day-detail-header"><p><span>Tarea</span><ChevronDown size={13}/><span>{done?'Terminada':'En seguimiento'}</span></p><button aria-label="Cerrar tarea" disabled={busy||editing} onClick={onClose}><X size={20}/></button></header>
    <div className="day-detail-title"><h1 id="day-task-title">{task.title}</h1><div><select aria-label="Cambiar estado de la tarea" value={task.statusId} disabled={busy||!canMoveTask(task,statuses,props.currentUserId,props.canChangeTaskStatus,props.canMoveClosedTasks)} onChange={event=>void act(()=>props.onSubtaskStatusChange(task.id,event.target.value),'Estado actualizado.')}>
      {taskStatusOptions(task,statuses).map(status=><option key={status.id} value={status.id}>{status.name}</option>)}</select><span className={`day-priority ${task.priority.toLowerCase()}`}><i/>{priorityLabels[task.priority]}</span>{(caps?.canEdit||caps?.canUpdateProgress)&&<Button variant="ghost" size="sm" icon={<Pencil size={14}/>} disabled={busy} onClick={()=>setEditing(!editing)}>{editing?'Cerrar edición':'Editar'}</Button>}</div></div>
    <div className="task-action-bar">{nextStatus&&<Button variant="primary" icon={<CheckCircle2 size={16}/>} disabled={busy||editing} onClick={()=>void act(()=>props.onSubtaskStatusChange(task.id,nextStatus.id),'Estado actualizado.')}>{nextLabel}</Button>}{props.onOpenChat&&<Button variant="secondary" size="sm" icon={<MessageSquareText size={15}/>} disabled={busy||editing} onClick={props.onOpenChat}>Chat del proyecto</Button>}{props.canDeleteTask&&<Button variant="ghost" size="sm" icon={<Trash2 size={15}/>} disabled={busy||editing} onClick={()=>{setError('');setDeleteVersion(task.updatedAt);}}>Eliminar tarea</Button>}</div>
    <nav className="day-detail-tabs"><button className={tab==='work'?'selected':''} onClick={()=>switchTab('work')}>El trabajo</button><button className={tab==='activity'?'selected':''} onClick={()=>switchTab('activity')}>Mensajes <span>{comments.length}</span></button></nav>
    <div ref={scrollRef} className="day-detail-scroll" onScroll={event=>{const element=event.currentTarget;const close=tab==='activity'&&messagesEnd.current ? messagesEnd.current.getBoundingClientRect().bottom<=element.getBoundingClientRect().bottom+100 : element.scrollHeight-element.scrollTop-element.clientHeight<180;setNearLatest(close);if(close)setNewMessages(0);}}>{error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="day-detail-notice" role="status"><Check size={14}/>{notice}</p>}{props.isLoading&&<p className="day-detail-loading">Actualizando información…</p>}
    {editing&&<TaskEditor key={task.id} task={task} canEditDetails={Boolean(caps?.canEdit)} canEditProgress={Boolean(caps?.canUpdateProgress)} onSave={async input=>{setBusy(true);try{await props.onUpdateTaskPlan(input);setNotice('Cambios guardados.');}finally{setBusy(false);}}} onClose={()=>setEditing(false)}/>}
    {tab==='work'?<>
      <div className="day-detail-grid"><section className="day-detail-description"><h2>Qué hay que hacer</h2><p>{task.description||'Esta tarea todavía no tiene descripción.'}</p>{!task.description&&caps?.canEdit&&<button onClick={()=>setEditing(true)}><Plus size={14}/>Agregar descripción</button>}</section><aside className="day-detail-facts"><div><span><CalendarClock size={15}/>Entrega</span><strong>{formatDate(task.dueAt)}</strong></div><div><span><Clock3 size={15}/>Tiempo estimado</span><strong>{task.estimateMinutes===undefined?'Sin estimar':formatMinutes(task.estimateMinutes)}</strong></div><div><span><CheckCircle2 size={15}/>Avance</span><strong>{done?100:task.progress}%</strong></div><div className="day-progress-track"><i style={{width:`${done?100:task.progress}%`}}/></div></aside></div>
      <section className="day-detail-people"><header><h2><UsersRound size={17}/>Responsables</h2>{caps?.canAssign&&<Button variant="ghost" size="sm" icon={<Plus size={15}/>} onClick={()=>setAssignOpen(!assignOpen)}>{assignOpen?'Cerrar':'Asignar persona'}</Button>}</header><div className="day-assigned-people">{task.assignees?.map(person=><span key={person.userId}><b>{initials(person.user.name)}</b>{person.user.name}{caps?.canAssign&&<button disabled={busy} aria-label={`Quitar a ${person.user.name} de la tarea`} onClick={()=>void act(async()=>{await apiRequest(`/tasks/${task.id}/assignees/${person.userId}`,{token,method:'DELETE'});await props.onReload();},'Responsable retirado de la tarea.')}><X size={12}/></button>}</span>)}{!task.assignees?.length&&<p>Sin responsable. Asigna a alguien para que aparezca en su agenda.</p>}</div>
        {assignOpen&&<div className="day-assign-dropdown"><label className="day-search"><Search size={15}/><input autoFocus placeholder="Buscar persona…" aria-label="Buscar persona para asignar" value={personSearch} onChange={event=>setPersonSearch(event.target.value)}/></label>{people.isLoading&&<p>Cargando personas…</p>}{people.error&&<p className="form-error">{people.error.message}</p>}<div>{candidates.map(person=><button key={person.id} disabled={busy} onClick={()=>void act(async()=>{await props.onAddTaskAssignee(task.id,person.id);},`${person.name} recibió la asignación.`)}><span className="person-avatar">{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.inProject?'Participa en este proyecto':`${person.area??'Tu área'} · Se incorporará al proyecto`}</small></span><Plus size={16}/></button>)}</div>{!people.isLoading&&!candidates.length&&<p>No hay más personas disponibles con esta búsqueda.</p>}</div>}
      </section>
      <section className="day-detail-subtasks"><header><h2><GitBranch size={17}/>Pasos para terminar</h2><span>{checked} de {subtasks.length}</span></header>{subtasks.map(item=><article key={item.id}><span className={`day-subtask-check ${isTaskDone(item,statuses)?'done':''}`}>{isTaskDone(item,statuses)&&<Check size={13}/>}</span><div><strong>{item.title}</strong><small>{item.assignees?.map(person=>person.user.name).join(', ')||'Sin responsable'}</small>{item.capabilities?.canLogTime&&<details><summary>Registrar tiempo</summary><form onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);void act(async()=>{await props.onCreateSubtaskTimeLog(item.id,Number(data.get('minutes')),String(data.get('note')??'')||undefined);form.reset();},'Tiempo registrado.');}}><input name="minutes" type="number" min={1} max={1440} required placeholder="Minutos" aria-label={`Minutos en ${item.title}`}/><input name="note" placeholder="Qué realizaste" maxLength={2000} aria-label={`Nota de tiempo en ${item.title}`}/><Button size="sm" type="submit" disabled={busy}>Guardar</Button></form></details>}</div><select aria-label={`Estado de ${item.title}`} value={item.statusId} disabled={busy||!canMoveTask(item,statuses,props.currentUserId,props.canChangeTaskStatus,props.canMoveClosedTasks)} onChange={event=>void act(()=>props.onSubtaskStatusChange(item.id,event.target.value),'Paso actualizado.')}>
        {taskStatusOptions(item,statuses).map(status=><option key={status.id} value={status.id}>{status.name}</option>)}</select></article>)}
        {caps?.canCreateSubtasks&&<form className="day-subtask-create" onSubmit={event=>{event.preventDefault();const title=newSubtask.trim();if(title.length<2)return;void act(async()=>{await props.onCreateSubtask({title,priority:'MEDIUM',assigneeIds:task.assignees?.map(person=>person.userId)??[]});setNewSubtask('');},'Paso agregado con los responsables de la tarea.');}}><Plus size={17}/><input required minLength={2} maxLength={240} value={newSubtask} onChange={event=>setNewSubtask(event.target.value)} aria-label="Nuevo paso" placeholder="Agregar un paso concreto…"/><Button type="submit" size="sm" disabled={busy||newSubtask.trim().length<2}>Agregar</Button></form>}{!subtasks.length&&!caps?.canCreateSubtasks&&<p className="day-detail-empty">Esta tarea no tiene subtareas.</p>}
      </section>
      <details className="day-detail-time"><summary><Clock3 size={17}/><strong>Tiempo trabajado</strong><span>{formatMinutes(minutes)}</span></summary><div>{timeLogs.map(log=><article key={log.id}><strong>{log.user?.name??'Equipo'}</strong><span>{formatMinutes(log.minutes)}</span><p>{log.note||formatDate(log.logDate)}</p></article>)}{caps?.canLogTime&&<form onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);void act(async()=>{await props.onCreateTimeLog(Number(data.get('minutes')),String(data.get('note')??'')||undefined);form.reset();},'Tiempo registrado.');}}><label>Minutos trabajados<input type="number" required min={1} max={1440} name="minutes" placeholder="Ej. 30"/></label><label>Qué realizaste<input name="note" maxLength={2000} placeholder="Opcional"/></label><Button type="submit" disabled={busy}>Registrar tiempo</Button></form>}</div></details>
    </>:<section className="day-conversation"><header className="conversation-heading"><div><h2>Conversación de esta tarea</h2><p>Mensajes y acuerdos relacionados con «{task.title}».</p></div><span className={`conversation-connection ${props.connectionState}`}><i/>{props.connectionState==='live'?'En tiempo real':'Reconectando…'}</span></header>
      {props.connectionState!=='live'&&<p className="conversation-reconnect" role="status">Los mensajes nuevos aparecerán al recuperar la conexión. Lo que estás escribiendo se conserva.</p>}
      <div className="conversation-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mensajes de la tarea">{comments.map(item=><article id={`message-${item.id}`} className={`day-comment ${item.userId===props.currentUserId?'own-message':''} ${commentId===item.id?'highlighted-message':''}`} key={item.id}><span className="person-avatar">{initials(item.user.name)}</span><div><header><strong>{item.userId===props.currentUserId?'Tú':item.user.name}</strong><small>{formatEventDate(item.createdAt)}</small>{item.isInternal&&<span>Solo equipo interno</span>}</header><p>{item.body}</p></div></article>)}</div>{!comments.length&&<p className="day-detail-empty">Todavía no hay mensajes. Comparte un avance o inicia la conversación.</p>}<div ref={messagesEnd}/>
      {newMessages>0&&<button className="conversation-new" onClick={()=>{messagesEnd.current?.scrollIntoView({behavior:'smooth',block:'end'});setNewMessages(0);}}>{newMessages} {newMessages===1?'mensaje nuevo':'mensajes nuevos'} ↓</button>}
      {caps?.canComment?<form className="conversation-composer" onSubmit={event=>{event.preventDefault();const body=comment.trim();if(!body)return;void act(async()=>{await props.onCreateComment(body,internal);setComment('');setNearLatest(true);},'Mensaje enviado.');}}><textarea aria-label="Escribir mensaje" value={comment} onChange={event=>setComment(event.target.value)} required maxLength={10000} rows={3} placeholder="Escribe un mensaje para el equipo…"/><p className="conversation-audience">{internal?'Solo las personas internas con acceso a esta tarea pueden leerlo.':'Lo pueden leer las personas con acceso a esta tarea, incluidos sus invitados.'}</p><footer>{caps.canSeeInternalComments&&<label><input type="checkbox" checked={internal} onChange={event=>setInternal(event.target.checked)}/>Mensaje interno</label>}<Button variant="primary" size="sm" icon={<Send size={14}/>} type="submit" disabled={busy||!comment.trim()}>{busy?'Enviando…':'Enviar mensaje'}</Button></footer></form>:<p className="day-detail-empty">Puedes leer la conversación. Tu acceso o el estado de la tarea no permite enviar mensajes.</p>}

      {caps?.canAssign&&<details className="day-followers"><summary>Compartir seguimiento</summary><p>Permite que otra persona del proyecto siga esta tarea sin asignársela.</p><form onSubmit={event=>{event.preventDefault();const id=String(new FormData(event.currentTarget).get('userId')??'');if(id)void act(()=>props.onMentionTaskUser(task.id,id),'Seguimiento compartido.');}}><select name="userId" aria-label="Persona para seguimiento" required defaultValue=""><option value="" disabled>Elegir persona del proyecto</option>{props.projectMembers.filter(member=>!task.mentions?.some(item=>item.userId===member.userId)&&!task.assignees?.some(item=>item.userId===member.userId)).map(member=><option key={member.userId} value={member.userId}>{member.user.name}</option>)}</select><Button type="submit" disabled={busy}>Compartir</Button></form></details>}
      {(task.mentions?.length??0)>0&&<p className="day-followers-label">Siguen esta tarea: {task.mentions?.map(item=>item.user.name).join(', ')}</p>}
    </section>}
    <details className="day-detail-history"><summary>Historial de cambios <span>{events.length}</span></summary><div>{events.map(event=>{const text=getEventText(event,statuses);return <article key={event.id}><i/><div><strong>{text.title}</strong><p>{text.description}</p><small>{event.actor?.name??'Sistema'} · {formatEventDate(event.createdAt)}</small></div></article>;})}</div></details>
    </div>
  </section>{deleteVersion&&<Dialog title="Eliminar tarea" description={`Se quitará «${task.title}» del tablero y de las agendas del equipo.`} busy={busy} onClose={()=>setDeleteVersion(undefined)}><div className="product-form"><p>También se retirarán sus subtareas. Los registros de seguimiento se conservarán para auditoría.</p>{error&&<p className="form-error" role="alert">{error}</p>}<footer className="product-form-actions"><Button disabled={busy} onClick={()=>setDeleteVersion(undefined)}>Cancelar</Button><Button variant="danger" disabled={busy} onClick={()=>void act(async()=>{await apiRequest(`/tasks/${task.id}`,{token,method:'DELETE',body:{expectedUpdatedAt:deleteVersion}});await props.onReload();setDeleteVersion(undefined);onClose();},'Tarea eliminada.')}>{busy?'Eliminando…':'Eliminar tarea'}</Button></footer></div></Dialog>}</div>;
}
