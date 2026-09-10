import { useState } from 'react';
import { Check, Download, RefreshCw, Share, Smartphone } from 'lucide-react';
import { installPwa, isIos, updatePwa, usePwa } from '../lib/pwa';
import { Button } from './ui';
import { Dialog } from './ui/Dialog';

export function InstallAppButton() {
  const pwa = usePwa();
  const [help, setHelp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function install() {
    if (!pwa.canInstall) { setHelp(true); return; }
    setBusy(true); setError('');
    try { await installPwa(); }
    catch { setError('No se pudo abrir la instalación. Usa el menú de tu navegador.'); setHelp(true); }
    finally { setBusy(false); }
  }
  return <>
    <Button className="pwa-install-button" icon={pwa.installed ? <Check size={18}/> : <Download size={18}/>} disabled={pwa.installed || busy} onClick={() => void install()}>{pwa.installed ? 'App instalada' : busy ? 'Abriendo instalación…' : 'Instalar Vianko Day'}</Button>
    {help && <Dialog title="Instala Vianko Day" description="Abre tus tareas y avisos desde un icono en tu dispositivo." onClose={() => setHelp(false)}>
      <div className="product-form pwa-install-help"><Smartphone size={32}/>
        {!window.isSecureContext ? <p>Abre <a href="https://vianko-day.vianko.cloud">vianko-day.vianko.cloud</a> para instalar la aplicación.</p> : isIos() ? <ol><li>Abre Vianko Day en Safari.</li><li>Toca <Share size={15}/> Compartir y elige <strong>Agregar a pantalla de inicio</strong>.</li><li>Abre el nuevo icono y activa los avisos en Notificaciones.</li></ol> : <ol><li>Abre el menú de Chrome o Edge.</li><li>Busca <strong>Instalar Vianko Day</strong> o la opción de instalar esta página como aplicación.</li><li>Confirma la instalación y abre el nuevo icono.</li></ol>}
        <p>Si ya la instalaste, abre su icono. El navegador puede dejar de ofrecer la instalación cuando la app ya está agregada.</p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <Button variant="primary" onClick={() => setHelp(false)}>Entendido</Button>
      </div>
    </Dialog>}
  </>;
}

export function PwaUpdateNotice() {
  const pwa = usePwa();
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!pwa.updateReady || later) return null;
  return <aside className="pwa-update-notice" role="status"><RefreshCw size={20}/><div><strong>Hay una nueva versión</strong><p>Termina lo que estás escribiendo antes de actualizar.</p></div><Button disabled={busy} onClick={() => setLater(true)}>Después</Button><Button variant="primary" disabled={busy} onClick={() => { setBusy(true); void updatePwa().catch(() => setBusy(false)); }}>{busy ? 'Actualizando…' : 'Actualizar'}</Button></aside>;
}
