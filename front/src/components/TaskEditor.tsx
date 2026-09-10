import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import type { UpdateTaskInput } from "../api/endpoints";
import { priorityLabels } from "../lib/tasks";
import type { Task } from "../types";
import { Button } from "./ui";

export function TaskEditor({ task, canEditDetails, canEditProgress, onSave, onClose }: {
  task: Task; canEditDetails: boolean; canEditProgress: boolean;
  onSave: (input: UpdateTaskInput) => Promise<void>; onClose: () => void;
}) {
  // Keep the version the person started editing, even when realtime updates arrive.
  const [original] = useState(task);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const read = (key: string) => String(data.get(key) ?? "").trim();
    const input: UpdateTaskInput = {};
    if (canEditDetails) {
      if (read("title") !== original.title) input.title = read("title");
      if (read("description") !== (original.description ?? "")) input.description = read("description");
      if (read("priority") !== original.priority) input.priority = read("priority") as Task["priority"];
      for (const field of ["startAt", "dueAt"] as const) {
        if (read(field) !== (original[field]?.slice(0, 10) ?? "")) {
          if (read(field)) input[field] = `${read(field)}T00:00:00.000Z`;
          else (input.clearFields ??= []).push(field);
        }
      }
      if (read("estimateMinutes") !== String(original.estimateMinutes ?? "")) {
        if (read("estimateMinutes")) input.estimateMinutes = Number(read("estimateMinutes"));
        else (input.clearFields ??= []).push("estimateMinutes");
      }
      if (read("startAt") && read("dueAt") && read("dueAt") < read("startAt")) {
        setError("El vencimiento no puede ser anterior al inicio."); return;
      }
    }
    if (canEditProgress && Number(read("progress")) !== original.progress) input.progress = Number(read("progress"));
    if (!Object.keys(input).length) { onClose(); return; }
    setSaving(true); setError("");
    try { await onSave({ ...input, expectedUpdatedAt: original.updatedAt }); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se guardaron los cambios. Inténtalo de nuevo."); }
    finally { setSaving(false); }
  }
  return <form className="task-editor" onSubmit={submit}>
    <fieldset disabled={saving}>
      <legend>Editar tarea</legend>
      {canEditDetails ? <>
        <label className="editor-wide">Título<input autoFocus name="title" defaultValue={original.title} minLength={2} maxLength={240} required /></label>
        <label className="editor-wide">Descripción<textarea name="description" defaultValue={original.description ?? ""} rows={4} maxLength={10000} placeholder="Contexto, entregable y criterio de finalización" /></label>
        <label>Prioridad<select name="priority" defaultValue={original.priority}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Estimado en minutos<input name="estimateMinutes" type="number" min={0} max={100000} defaultValue={original.estimateMinutes ?? ""} placeholder="Sin estimar" /></label>
        <label>Inicio<input name="startAt" type="date" defaultValue={original.startAt?.slice(0, 10) ?? ""} /></label>
        <label>Vencimiento<input name="dueAt" type="date" defaultValue={original.dueAt?.slice(0, 10) ?? ""} /></label>
      </> : undefined}
      {canEditProgress ? <label>Avance (%)<input name="progress" type="number" min={0} max={100} required defaultValue={original.progress} /></label> : undefined}
    </fieldset>
    <p className="muted">El estado determina cuándo se completa la tarea. El avance registra el progreso del trabajo.</p>
    {error ? <p className="form-error" role="alert">{error}</p> : undefined}
    <div className="modal-actions"><Button disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" icon={<Save size={16} />} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button></div>
  </form>;
}
