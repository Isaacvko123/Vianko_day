import { FormEvent, useState } from "react";
import { CheckCircle2, ClipboardCheck, Eye, EyeOff, HelpCircle, LockKeyhole, LogIn, Search, Sparkles, X } from "lucide-react";
import { Button } from "./ui";
import type { AuthMode, AuthSession, RegistrationOptions } from "../types";
import { getRegistrationOptions, login, register, requestAccess } from "../api/endpoints";

type AuthScreenProps = {
  onAuthenticated: (session: AuthSession) => void;
};

function readFormString(form: HTMLFormElement, fieldName: string) {
  const value = new FormData(form).get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [registrationOptions, setRegistrationOptions] = useState<RegistrationOptions>();
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedLocalityId, setSelectedLocalityId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isAccessGuideOpen, setIsAccessGuideOpen] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const positionsForSelectedArea = registrationOptions?.positions.filter((position) => position.areaId === selectedAreaId) ?? [];
  const localitiesForSelectedArea = registrationOptions?.localities.filter((locality) => locality.areaId === selectedAreaId) ?? [];

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function loadRequestOptions(workspaceSlug: string) {
    setIsLoadingOptions(true);
    setErrorMessage("");

    try {
      const options = await getRegistrationOptions(workspaceSlug);
      const defaultAreaId = options.areas[0]?.id ?? "";
      setRegistrationOptions(options);
      setSelectedAreaId(defaultAreaId);
      setSelectedLocalityId(options.localities.find((locality) => locality.areaId === defaultAreaId)?.id ?? "");
    } catch (error) {
      setRegistrationOptions(undefined);
      setSelectedAreaId("");
      setSelectedLocalityId("");
      setErrorMessage(error instanceof Error ? error.message : "No se pudieron cargar las areas.");
    } finally {
      setIsLoadingOptions(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const form = event.currentTarget;
      const email = readFormString(form, "email");
      const password = readFormString(form, "password");

      if (mode === "request") {
        const areaId = readFormString(form, "areaId");
        const localityId = readFormString(form, "localityId");
        const positionId = readFormString(form, "positionId");

        if (!areaId || !localityId || !positionId) {
          throw new Error("Selecciona area, localidad y puesto antes de enviar la solicitud.");
        }

        await requestAccess({
          workspaceSlug: readFormString(form, "workspaceSlug"),
          name: readFormString(form, "name"),
          email,
          password,
          areaId,
          localityId,
          positionId,
          userType: readFormString(form, "userType") === "EXTERNAL" ? "EXTERNAL" : "INTERNAL"
        });

        setSuccessMessage("Solicitud enviada. Un gerente de area o TI debe aprobar el acceso.");
        form.reset();
        return;
      }

      const session = mode === "login"
        ? await login({ email, password })
        : await register({
          name: readFormString(form, "name"),
          email,
          password,
          workspaceName: readFormString(form, "workspaceName")
        });

      onAuthenticated(session);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">
          <Sparkles size={20} />
          <span>Vianko Day</span>
        </div>
        <h1>Gestion operativa sin ruido.</h1>
        <p>
          Actividades, responsables, tiempos y seguimiento en un flujo claro para equipos internos y externos.
        </p>
        <div className="auth-value-list">
          <span><CheckCircle2 size={17} /> Tableros por proyecto</span>
          <span><CheckCircle2 size={17} /> Auditoria de cambios</span>
          <span><CheckCircle2 size={17} /> Comentarios cifrados</span>
        </div>
      </section>

      <section className="auth-card">
        <button className="ghost-button auth-guide-button" type="button" onClick={() => setIsAccessGuideOpen((isOpen) => !isOpen)}>
          <HelpCircle size={17} />
          Guia de acceso
        </button>
        {isAccessGuideOpen ? (
          <section className="auth-help-card">
            <header>
              <strong>Como entrar correctamente</strong>
              <button className="icon-button" type="button" onClick={() => setIsAccessGuideOpen(false)} title="Cerrar guia">
                <X size={16} />
              </button>
            </header>
            <ol>
              <li><strong>Login:</strong> usalo si tu cuenta ya fue aprobada.</li>
              <li><strong>Solicitud:</strong> busca el workspace, elige area, localidad y puesto; despues espera aprobacion.</li>
              <li><strong>Registro:</strong> usalo solo para crear un workspace nuevo.</li>
            </ol>
          </section>
        ) : undefined}
        <div className="segmented">
          <button className={mode === "login" ? "active" : ""} type="button" onClick={() => changeMode("login")}>
            Login
          </button>
          <button className={mode === "request" ? "active" : ""} type="button" onClick={() => changeMode("request")}>
            Solicitud
          </button>
          <button className={mode === "register" ? "active" : ""} type="button" onClick={() => changeMode("register")}>
            Registro
          </button>
        </div>

        <form className="form-stack" onSubmit={handleSubmit} autoComplete="off">
          {mode === "request" ? (
            <>
              <label>
                Workspace
                <div className="inline-control">
                  <input name="workspaceSlug" minLength={2} required defaultValue="vianko" />
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={isLoadingOptions}
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (form) {
                        void loadRequestOptions(readFormString(form, "workspaceSlug"));
                      }
                    }}
                  >
                    <Search size={17} />
                    {isLoadingOptions ? "Buscando..." : "Buscar"}
                  </button>
                </div>
              </label>
              <label>
                Nombre
                <input name="name" minLength={2} required placeholder="Nombre Apellido" autoComplete="off" />
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
                <select
                  name="areaId"
                  required
                  value={selectedAreaId}
                  onChange={(event) => {
                    const nextAreaId = event.currentTarget.value;
                    setSelectedAreaId(nextAreaId);
                    setSelectedLocalityId(registrationOptions?.localities.find((locality) => locality.areaId === nextAreaId)?.id ?? "");
                  }}
                >
                  <option value="">Seleccionar</option>
                  {registrationOptions?.areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Localidad
                <select
                  name="localityId"
                  required
                  key={selectedAreaId}
                  value={selectedLocalityId}
                  onChange={(event) => setSelectedLocalityId(event.currentTarget.value)}
                >
                  <option value="">Seleccionar</option>
                  {localitiesForSelectedArea.map((locality) => (
                    <option key={locality.id} value={locality.id}>{locality.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Puesto
                <select name="positionId" key={selectedAreaId} required defaultValue="">
                  <option value="">Seleccionar</option>
                  {positionsForSelectedArea.map((position) => (
                    <option key={position.id} value={position.id}>{position.name}</option>
                  ))}
                </select>
              </label>
            </>
          ) : undefined}

          {mode === "register" ? (
            <>
              <label>
                Nombre
                <input name="name" minLength={2} required placeholder="Nombre Apellido" autoComplete="off" />
              </label>
              <label>
                Empresa / workspace
                <input name="workspaceName" minLength={2} required placeholder="Vianko" />
              </label>
            </>
          ) : undefined}

          <label>
            Correo
            <input name="email" type="email" required placeholder="nombre@example.com" autoComplete="off" />
          </label>
          <label>
            Password
            <span className="password-field">
              <input
                name="password"
                type={isPasswordVisible ? "text" : "password"}
                minLength={8}
                required
                placeholder="Minimo 8 caracteres"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setIsPasswordVisible((isVisible) => !isVisible)}
                title={isPasswordVisible ? "Ocultar password" : "Ver password"}
                aria-label={isPasswordVisible ? "Ocultar password" : "Ver password"}
              >
                {isPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          {errorMessage ? <p className="form-error">{errorMessage}</p> : undefined}
          {successMessage ? <p className="form-success">{successMessage}</p> : undefined}

          <Button
            icon={mode === "login" ? <LogIn size={18} /> : mode === "request" ? <ClipboardCheck size={18} /> : <LockKeyhole size={18} />}
            type="submit"
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Procesando..." : mode === "login" ? "Entrar" : mode === "request" ? "Enviar solicitud" : "Crear cuenta"}
          </Button>
        </form>
      </section>
    </main>
  );
}
