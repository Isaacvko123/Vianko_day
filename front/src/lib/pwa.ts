import { useSyncExternalStore } from 'react';

type InstallPrompt = Event & { prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const standalone = () => matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
let state = { installed: standalone(), canInstall: false, updateReady: false, workerReady: false };
const listeners = new Set<() => void>();
let prompt: InstallPrompt | undefined;
let registration: Promise<ServiceWorkerRegistration> | undefined;
let started = false;
let applyUpdate = false;
function publish(next: Partial<typeof state>) { state = { ...state, ...next }; listeners.forEach(listener => listener()); }
export function usePwa() { return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state); }
export function isIos() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

export async function registerPwa() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('Abre la dirección HTTPS de Vianko para instalar la app y recibir avisos.');
  if (!registration) {
    registration = navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(result => {
      const update = () => { if (result.waiting && navigator.serviceWorker.controller) publish({ updateReady: true }); };
      update();
      result.addEventListener('updatefound', () => result.installing?.addEventListener('statechange', update));
      return result;
    }).catch(error => { registration = undefined; throw error; });
  }
  await registration;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('La app no pudo prepararse. Recarga e inténtalo otra vez.')), 15000); })
    ]);
    publish({ workerReady: true });
    return ready;
  } finally { clearTimeout(timer); }
}

export function startPwa() {
  if (started) return;
  started = true;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event as InstallPrompt; publish({ canInstall: true }); });
  window.addEventListener('appinstalled', () => { prompt = undefined; publish({ installed: true, canInstall: false }); });
  matchMedia('(display-mode: standalone)').addEventListener('change', () => publish({ installed: standalone() }));
  navigator.serviceWorker?.addEventListener('controllerchange', () => { if (applyUpdate) window.location.reload(); });
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    void registerPwa().catch(() => undefined);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void registration?.then(worker => worker.update()).catch(() => undefined); });
  }
}

export async function installPwa() {
  if (!prompt) return false;
  const current = prompt;
  prompt = undefined;
  publish({ canInstall: false });
  const result = await current.prompt();
  const choice = result ?? await current.userChoice;
  if (choice.outcome === 'accepted') publish({ installed: true });
  return choice.outcome === 'accepted';
}

export async function updatePwa() {
  const worker = await registration;
  if (worker?.waiting) { applyUpdate = true; worker.waiting.postMessage({ type: 'SKIP_WAITING' }); }
}
