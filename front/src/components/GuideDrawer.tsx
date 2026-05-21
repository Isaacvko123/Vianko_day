import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, LocateFixed, X } from "lucide-react";
import type { ViewKey } from "../types";

type GuideStep = {
  title: string;
  body: string;
  target: string;
  selector: string;
  result: string;
};

type GuideContent = {
  title: string;
  purpose: string;
  steps: GuideStep[];
  checkpoints: string[];
};

type GuideDrawerProps = {
  currentView: ViewKey;
  isOpen: boolean;
  onClose: () => void;
};

type GuidePlacement = {
  spotlight?: CSSProperties;
  card: CSSProperties;
  docked: boolean;
  foundTarget: boolean;
};

const fallbackGuideStep: GuideStep = {
  title: "Guia de uso",
  body: "Abre una seccion de la plataforma para iniciar el recorrido guiado sobre sus controles reales.",
  target: "Pantalla activa",
  selector: "[data-guide='guide-open-top']",
  result: "Puedes volver a abrir esta guia desde el boton Guia."
};

const guideByView: Record<ViewKey, GuideContent> = {
  projects: {
    title: "Tutorial guiado de proyectos",
    purpose: "Aqui se decide que existe, a que area pertenece, que fechas tiene y quien puede verlo.",
    steps: [
      {
        title: "Lee los indicadores del modulo",
        body: "Antes de crear algo, revisa total, privados, vencidos y proyectos con fechas. Si algo aparece vencido, el tablero necesita atencion antes de abrir mas trabajo.",
        target: "Indicadores superiores",
        selector: "[data-guide='projects-stats']",
        result: "Entiendes la salud general del portafolio antes de crear otro proyecto."
      },
      {
        title: "Crea un proyecto formal",
        body: "Pulsa Nuevo proyecto. El modal pide nombre, visibilidad, area, localidad, fechas y color. Las fechas son importantes porque alimentan seguimiento y reportes.",
        target: "Boton Nuevo proyecto",
        selector: "[data-guide='projects-new']",
        result: "Se abre el formulario para registrar alcance, lugar y fechas."
      },
      {
        title: "Entra al proyecto correcto",
        body: "Da clic en una tarjeta de proyecto. Eso cambia el proyecto activo y te manda al tablero de actividades de ese proyecto.",
        target: "Tarjeta de proyecto",
        selector: "[data-guide='projects-card']",
        result: "El tablero carga actividades, estados, miembros y archivo de terminadas de ese proyecto."
      }
    ],
    checkpoints: ["Nombre entendible", "Area y localidad correctas", "Fechas inicio/fin reales", "Visibilidad revisada"]
  },
  board: {
    title: "Tutorial guiado del tablero",
    purpose: "Aqui se ejecuta el trabajo vivo. Gerencia/Admin/Lider TI ven todo; perfiles operativos ven solo lo asignado o lo mencionado.",
    steps: [
      {
        title: "Crea la actividad principal",
        body: "Pulsa Nueva actividad. Captura objetivo, prioridad, fechas, estimado y asignados. Si falta una persona, primero agregala al proyecto desde Miembros proyecto.",
        target: "Boton Nueva actividad",
        selector: "[data-guide='board-new-task']",
        result: "La actividad aparece en su columna inicial y se puede abrir para detalle."
      },
      {
        title: "Abre una actividad",
        body: "Da clic en una tarjeta. Se abre el detalle con resumen, planeacion, subtareas, eventos, comentarios y tiempo.",
        target: "Tarjeta de actividad",
        selector: "[data-guide='task-card']",
        result: "El detalle te deja registrar seguimiento sin perder el contexto del tablero."
      },
      {
        title: "Controla quien la ve",
        body: "En Resumen, gerencia puede asignar responsables o mencionar usuarios. Asignar los vuelve responsables; mencionar solo les da visibilidad y contexto sin convertirlos en responsables.",
        target: "Asignacion y menciones",
        selector: "[data-guide='task-access-panel']",
        result: "La actividad queda visible para la persona correcta sin abrir todo el proyecto."
      },
      {
        title: "Divide trabajo en subtareas",
        body: "En el detalle entra a Subtareas. Crea pasos concretos con inicio, fin, estimado, responsable y registro de tiempo. Cada subtarea alimenta el resumen de horas.",
        target: "Panel de subtareas",
        selector: "[data-guide='task-subtasks-tab']",
        result: "La actividad principal muestra avance de subtareas y el tablero queda limpio."
      },
      {
        title: "Revisa terminadas sin ensuciar el tablero",
        body: "Las terminadas quedan separadas en Archivo. Revisa la tabla por proyecto para ver cuantas cerraron, cuanto se estimo y cuanto tiempo real se registro.",
        target: "Archivo de terminadas",
        selector: "[data-guide='board-completed']",
        result: "El seguimiento historico queda separado del trabajo vivo."
      }
    ],
    checkpoints: ["Asignados responsables", "Menciones solo para visibilidad", "Fechas y estimado completos", "Tiempo registrado por subtarea"]
  },
  management: {
    title: "Tutorial guiado de gerencia",
    purpose: "Aqui se piden personas entre areas. Sirve para que un gerente solicite apoyo y el gerente del area destino apruebe con personas concretas.",
    steps: [
      {
        title: "Revisa el flujo de solicitudes",
        body: "Los indicadores separan entrantes, enviadas, pendientes y aprobadas. Si hay pendientes, atiende primero lo que bloquea proyectos.",
        target: "Indicadores de gerencia",
        selector: "[data-guide='management-stats']",
        result: "Sabes si tu area debe responder o esta esperando respuesta."
      },
      {
        title: "Crea una solicitud",
        body: "Pulsa Nueva solicitud. Elige proyecto, area destino, localidad, puesto, rol, cantidad y nota. La nota debe explicar para que se necesita la persona.",
        target: "Boton Nueva solicitud",
        selector: "[data-guide='management-new-request']",
        result: "La solicitud queda pendiente para el area destino."
      },
      {
        title: "Atiende entrantes",
        body: "En Entrantes el gerente destino acepta con personas disponibles o rechaza con motivo. Si acepta, esas personas entran al proyecto.",
        target: "Columna Entrantes",
        selector: "[data-guide='management-incoming']",
        result: "El proyecto recibe personal aprobado y queda registro de la decision."
      }
    ],
    checkpoints: ["Proyecto correcto", "Area destino correcta", "Cantidad necesaria", "Nota con contexto operativo"]
  },
  members: {
    title: "Tutorial guiado de estructura y accesos",
    purpose: "Aqui se controla quien existe, donde pertenece y que puede hacer. Roles, areas, localidades y puestos cambian visibilidad real.",
    steps: [
      {
        title: "Revisa el directorio",
        body: "Cada tarjeta debe mostrar nombre completo, correo, area, localidades, puesto y rol. Si algo no cuadra, usa Editar antes de asignarle proyectos.",
        target: "Directorio de miembros",
        selector: ".people-grid",
        result: "Confirmas quien pertenece a cada area antes de invitar o aprobar mas personal."
      },
      {
        title: "Cambia a estructura",
        body: "Abre la pestana Estructura para revisar areas, localidades y puestos disponibles. Gerentes solo veran lo que les corresponde.",
        target: "Pestana Estructura",
        selector: "[data-guide='members-structure-tab']",
        result: "Ves el mapa operativo que se usara para registros e invitaciones."
      },
      {
        title: "Atiende pendientes",
        body: "Abre Pendientes. Antes de aprobar, confirma rol, area, una o varias localidades, puesto y tipo de usuario. Esa decision limita proyectos y actividades visibles.",
        target: "Pestana Pendientes",
        selector: "[data-guide='members-pending-tab']",
        result: "El usuario entra activo con permisos y alcance correctos."
      }
    ],
    checkpoints: ["Rol correcto", "Area correcta", "Localidades permitidas", "Puesto ligado al area"]
  },
  reports: {
    title: "Tutorial guiado de reportes",
    purpose: "Aqui se revisa salud operativa: avance, bloqueos, vencimientos, horas y productividad.",
    steps: [
      {
        title: "Lee la salud general",
        body: "Arriba ves total, terminadas, bloqueadas, vencidas y horas. Si vencidas o bloqueadas suben, hay riesgo operativo.",
        target: "KPIs de reportes",
        selector: "[data-guide='reports-kpis']",
        result: "Detectas si hay atraso, carga o falta de registro."
      },
      {
        title: "Compara proyectos",
        body: "El avance por proyecto muestra porcentaje y conteos. Un proyecto con muchas actividades y bajo avance necesita revision.",
        target: "Avance por proyecto",
        selector: "[data-guide='reports-projects']",
        result: "Priorizas conversaciones por proyecto, no por intuicion."
      },
      {
        title: "Revisa productividad",
        body: "Productividad cruza terminadas y tiempo registrado. Si alguien no registra tiempo, los reportes pierden valor.",
        target: "Productividad por usuario",
        selector: "[data-guide='reports-users']",
        result: "Sabes quien esta cerrando trabajo y quien esta registrando esfuerzo."
      }
    ],
    checkpoints: ["Sin vencidas criticas", "Bloqueos atendidos", "Horas registradas", "Proyectos con avance razonable"]
  }
};

function removeGuideHighlights() {
  document.querySelectorAll(".guide-target-pulse").forEach((element) => {
    element.classList.remove("guide-target-pulse");
  });
}

function placementForMissingTarget(viewportWidth: number, viewportHeight: number): GuidePlacement {
  const padding = 16;
  const cardWidth = Math.min(430, viewportWidth - padding * 2);
  const isMobile = viewportWidth <= 760;

  return {
    card: isMobile
      ? { left: 12, right: 12, bottom: 12 }
      : {
          left: Math.max(padding, (viewportWidth - cardWidth) / 2),
          top: Math.max(padding, (viewportHeight - 390) / 2),
          width: cardWidth
        },
    docked: isMobile,
    foundTarget: false
  };
}

function clampPosition(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createPlacement(selector: string): GuidePlacement {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = 18;
  const gap = 18;
  const cardWidth = Math.min(430, viewportWidth - padding * 2);
  const estimatedCardHeight = 390;
  const isMobile = viewportWidth <= 760;
  const target = document.querySelector<HTMLElement>(selector);

  if (!target) {
    return placementForMissingTarget(viewportWidth, viewportHeight);
  }

  const rect = target.getBoundingClientRect();

  if (isMobile) {
    return {
      spotlight: {
        left: Math.max(8, rect.left - 8),
        top: Math.max(8, rect.top - 8),
        width: Math.min(viewportWidth - 16, rect.width + 16),
        height: rect.height + 16
      },
      card: { left: 12, right: 12, bottom: 12 },
      docked: true,
      foundTarget: true
    };
  }

  let left = rect.right + gap;

  if (left + cardWidth > viewportWidth - padding) {
    left = rect.left - cardWidth - gap;
  }

  let top = clampPosition(rect.top - 8, padding, Math.max(padding, viewportHeight - estimatedCardHeight - padding));

  if (left < padding) {
    left = clampPosition(rect.left + rect.width / 2 - cardWidth / 2, padding, viewportWidth - cardWidth - padding);
    top = rect.bottom + gap;

    if (top + estimatedCardHeight > viewportHeight - padding) {
      top = rect.top - estimatedCardHeight - gap;
    }

    top = clampPosition(top, padding, Math.max(padding, viewportHeight - estimatedCardHeight - padding));
  }

  return {
    spotlight: {
      left: Math.max(8, rect.left - 8),
      top: Math.max(8, rect.top - 8),
      width: Math.min(viewportWidth - 16, rect.width + 16),
      height: rect.height + 16
    },
    card: { left, top, width: cardWidth },
    docked: false,
    foundTarget: true
  };
}

export function GuideDrawer({ currentView, isOpen, onClose }: GuideDrawerProps) {
  const guide = guideByView[currentView];
  const [activeStep, setActiveStep] = useState(0);
  const [placement, setPlacement] = useState<GuidePlacement>();
  const currentStep = guide.steps[activeStep] ?? guide.steps[0] ?? fallbackGuideStep;

  useEffect(() => {
    return removeGuideHighlights;
  }, []);

  useEffect(() => {
    setActiveStep(0);
  }, [currentView, isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return undefined;
    }

    removeGuideHighlights();
    const target = document.querySelector<HTMLElement>(currentStep.selector);

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      target.classList.add("guide-target-pulse");
    }

    const updatePlacement = () => {
      removeGuideHighlights();
      const activeTarget = document.querySelector<HTMLElement>(currentStep.selector);
      activeTarget?.classList.add("guide-target-pulse");
      setPlacement(createPlacement(currentStep.selector));
    };

    const firstPlacement = window.setTimeout(updatePlacement, 320);
    const secondPlacement = window.setTimeout(updatePlacement, 720);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      window.clearTimeout(firstPlacement);
      window.clearTimeout(secondPlacement);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      removeGuideHighlights();
    };
  }, [currentStep.selector, isOpen]);

  function closeGuide() {
    removeGuideHighlights();
    setActiveStep(0);
    onClose();
  }

  function nextStep() {
    if (activeStep >= guide.steps.length - 1) {
      closeGuide();
      return;
    }

    setActiveStep((current) => Math.min(current + 1, guide.steps.length - 1));
  }

  function previousStep() {
    setActiveStep((current) => Math.max(0, current - 1));
  }

  if (!isOpen || typeof document === "undefined") {
    return <></>;
  }

  const cardStyle = placement?.card ?? placementForMissingTarget(window.innerWidth, window.innerHeight).card;
  const cardClassName = placement?.docked === true ? "guide-tour-card is-docked" : "guide-tour-card";

  return createPortal(
    <div className="guide-shell" role="dialog" aria-modal="true" aria-label={guide.title}>
      {placement?.spotlight ? <span className="guide-spotlight" style={placement.spotlight} /> : undefined}

      <section className={cardClassName} style={cardStyle}>
        <button className="guide-close" type="button" aria-label="Cerrar guia" onClick={closeGuide}>
          <X size={18} />
        </button>

        <div className="guide-progress" aria-label="Pasos de la guia">
          {guide.steps.map((step, index) => (
            <button
              aria-current={index === activeStep ? "step" : undefined}
              aria-label={`Ir al paso ${index + 1}: ${step.title}`}
              className={index <= activeStep ? "is-active" : ""}
              key={step.title}
              type="button"
              onClick={() => setActiveStep(index)}
              style={{ width: `${100 / guide.steps.length}%` }}
            />
          ))}
        </div>

        <p className="guide-step-label">Paso {activeStep + 1} de {guide.steps.length}</p>
        <h2 id="guide-title">{currentStep.title}</h2>
        <p className="guide-purpose">{guide.purpose}</p>

        <div className="guide-current-target">
          <LocateFixed size={16} />
          <span>Ahora mira</span>
          <strong>{currentStep.target}</strong>
        </div>

        <p className="guide-step-body">{currentStep.body}</p>

        {placement?.foundTarget === false ? (
          <div className="guide-missing-target">
            Este control aun no esta visible. Abre el modal, entra al detalle o cambia a la pestana que menciona el paso; despues pulsa Siguiente o vuelve a este paso.
          </div>
        ) : undefined}

        <div className="guide-result">
          <CheckCircle2 size={17} />
          <span>{currentStep.result}</span>
        </div>

        <ul className="guide-mini-checklist" aria-label="Puntos de revision">
          {guide.checkpoints.slice(0, 4).map((checkpoint) => (
            <li key={checkpoint}>{checkpoint}</li>
          ))}
        </ul>

        <div className="guide-actions">
          <button className="button ghost compact" type="button" onClick={closeGuide}>
            Omitir
          </button>
          <div className="guide-step-actions">
            <button className="button ghost compact" type="button" onClick={previousStep} disabled={activeStep === 0}>
              <ChevronLeft size={16} />
              Anterior
            </button>
            <button className="button secondary compact" type="button" onClick={nextStep}>
              {activeStep >= guide.steps.length - 1 ? "Finalizar" : "Siguiente"}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
