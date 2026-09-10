import { useEffect, useRef } from "react";

const dialogStack: symbol[] = [];

export function useDialog(open: boolean, onClose: () => void, busy = false) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const dialogId = Symbol();
    dialogStack.push(dialogId);
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const inertElements: Array<{ element: HTMLElement; wasInert: boolean }> = [];
    let node: HTMLElement | null = ref.current;
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      for (const sibling of Array.from(parent?.children ?? [])) {
        if (sibling instanceof HTMLElement && sibling !== node) { inertElements.push({ element: sibling, wasInert: sibling.inert }); sibling.inert = true; }
      }
      node = parent;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    (ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0])?.focus();
    function handleKey(event: KeyboardEvent) {
      if (dialogStack[dialogStack.length - 1] !== dialogId) return;
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      const index = dialogStack.indexOf(dialogId); if (index >= 0) dialogStack.splice(index, 1);
      for (const { element, wasInert } of inertElements) element.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  return ref;
}
