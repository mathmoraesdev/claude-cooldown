import { useState, useEffect } from 'react';
import { Bell, Volume2, VolumeX, ShieldAlert, ShieldCheck, Sparkles, AlertCircle, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { NotificationSettings } from '../types';
import { notificationService, audioService } from '../services/notifications';
import { pushService } from '../services/push';

interface NotificationSettingsCardProps {
  settings: NotificationSettings;
  onUpdateSettings: (settings: NotificationSettings) => void;
}

export default function NotificationSettingsCard({
  settings,
  onUpdateSettings,
}: NotificationSettingsCardProps) {
  const [permission, setPermission] = useState(notificationService.getPermissionStatus());
  const [testActive, setTestActive] = useState(false);

  // Server push state
  const [serverUrl, setServerUrl] = useState(pushService.getServerUrl() || '');
  const [pushSubscribed, setPushSubscribed] = useState(pushService.isSubscribed());
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushTestSent, setPushTestSent] = useState(false);

  // Check permission status on mount and when settings open
  useEffect(() => {
    const checkPermission = () => {
      setPermission(notificationService.getPermissionStatus());
    };
    checkPermission();
    // Re-check periodically
    const id = setInterval(checkPermission, 3000);
    return () => clearInterval(id);
  }, []);

  const handleRequestPermission = async () => {
    const granted = await notificationService.requestPermission();
    setPermission(notificationService.getPermissionStatus());
    if (granted) {
      notificationService.sendNotification(
        '🔔 Notificações Ativadas!',
        'Pronto! Você receberá avisos automáticos conforme os prazos das contas Claude.',
        settings.sound
      );
    }
  };

  const handleToggle = (key: keyof NotificationSettings) => {
    onUpdateSettings({
      ...settings,
      [key]: !settings[key],
    });
  };

  const handleTestSound = () => {
    setTestActive(true);
    if (settings.sound) {
      audioService.playDoubleChime();
    }
    notificationService.sendNotification(
      '🔔 Teste de Notificação',
      'Excelente! Seu som de aviso está configurado e pronto.',
      false // Already played sound above
    );
    setTimeout(() => setTestActive(false), 800);
  };

  const handleActivatePush = async () => {
    setPushError(null);
    setPushLoading(true);
    const result = await pushService.subscribe(serverUrl);
    setPushLoading(false);
    if (result.ok) {
      setPushSubscribed(true);
    } else {
      setPushError(result.error || 'Não foi possível ativar.');
    }
  };

  const handleDeactivatePush = async () => {
    setPushLoading(true);
    await pushService.unsubscribe();
    setPushSubscribed(false);
    setPushLoading(false);
  };

  const handleTestPush = async () => {
    setPushTestSent(true);
    setPushError(null);
    const result = await pushService.sendTestNotification();
    if (!result.ok) setPushError(result.error || 'Falha ao enviar teste.');
    setTimeout(() => setPushTestSent(false), 1500);
  };

  const isGranted = permission === 'granted';

  return (
    <div className="rounded-[32px] border border-claude-border bg-claude-card p-6 sm:p-8 relative overflow-hidden shadow-sm">
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-claude-orange/5 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-claude-border">
        <div className="space-y-1">
          <h3 className="font-display font-bold text-base sm:text-lg text-claude-text-primary flex items-center gap-2">
            <Bell size={18} className="text-claude-orange" />
            Configuração de Alertas
          </h3>
          <p className="text-xs text-claude-text-secondary leading-relaxed">
            Configure alertas automáticos de contagem regressiva para nunca perder tempo.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {/* Permission Status / Prompt CTA */}
        {!isGranted ? (
          <div className="rounded-2xl border border-rose-500/15 bg-rose-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="text-rose-400 shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-xs font-semibold text-rose-400">Notificações Bloqueadas</p>
                <p className="text-[11px] text-rose-400/80 leading-relaxed mt-0.5">
                  Ative as permissões para disparar os alertas mesmo em segundo plano.
                </p>
              </div>
            </div>
            <button
              onClick={handleRequestPermission}
              className="rounded-xl bg-rose-500 hover:bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition-all shadow-md shadow-rose-500/10 active:scale-98 shrink-0 self-start sm:self-center cursor-pointer"
            >
              Permitir Alertas
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-3 flex items-center gap-2.5">
            <ShieldCheck className="text-emerald-400 shrink-0" size={16} />
            <p className="text-xs font-medium text-emerald-400">
              Notificações autorizadas no seu navegador!
            </p>
          </div>
        )}

        {/* Global toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-claude-bg-hover/40 p-4 rounded-2xl border border-claude-border">
          {/* Enable Notifications */}
          <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
            <span className="space-y-0.5">
              <span className="text-xs font-semibold text-claude-text-primary">Alertas Ativos</span>
              <p className="text-[10px] text-claude-text-secondary">Enviar avisos no sistema</p>
            </span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={() => handleToggle('enabled')}
              className="h-4 w-4 rounded border-claude-border bg-claude-card text-claude-orange focus:ring-claude-orange cursor-pointer"
            />
          </label>

          {/* Sound alerts */}
          <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
            <span className="space-y-0.5 flex items-center gap-2">
              <span className="space-y-0.5">
                <span className="text-xs font-semibold text-claude-text-primary">Som de Chime</span>
                <p className="text-[10px] text-claude-text-secondary">Tocar som local agradável</p>
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={() => handleToggle('sound')}
              className="h-4 w-4 rounded border-claude-border bg-claude-card text-claude-orange focus:ring-claude-orange cursor-pointer"
            />
          </label>
        </div>

        {/* Interval Milestone Swatches */}
        <div className="space-y-2.5">
          <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-claude-text-secondary">
            Disparar alertas nos momentos:
          </label>

          <div className="divide-y divide-claude-border rounded-2xl border border-claude-border bg-claude-dark/30 overflow-hidden">
            {[
              { key: 'notifyAt30m', label: '30 minutos antes', desc: 'Aviso inicial' },
              { key: 'notifyAt10m', label: '10 minutos antes', desc: 'Aviso intermediário' },
              { key: 'notifyAt5m', label: '5 minutos antes', desc: 'Aviso de preparação' },
              { key: 'notifyAt1m', label: '1 minuto antes', desc: 'Aviso crítico de preparação de prompt' },
              { key: 'notifyAtExact', label: 'No horário exato', desc: 'Conta liberada' },
            ].map((milestone) => (
              <label
                key={milestone.key}
                className="flex items-center justify-between gap-4 p-3.5 hover:bg-claude-bg-hover cursor-pointer transition-colors"
              >
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-claude-text-primary">{milestone.label}</span>
                  <p className="text-[10px] text-claude-text-secondary">{milestone.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings[milestone.key as keyof NotificationSettings]}
                  onChange={() => handleToggle(milestone.key as keyof NotificationSettings)}
                  disabled={!settings.enabled}
                  className="h-4 w-4 rounded border-claude-border bg-claude-card text-claude-orange focus:ring-claude-orange checked:bg-claude-orange disabled:opacity-40 cursor-pointer"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Server Push (works with the app fully closed) */}
        <div className="space-y-2.5">
          <label className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-claude-text-secondary flex items-center gap-1.5">
            <Wifi size={12} />
            Notificações com o app fechado
          </label>

          <div className="rounded-2xl border border-claude-border bg-claude-dark/30 p-4 space-y-3">
            <p className="text-[11px] text-claude-text-secondary leading-relaxed">
              Ativa um servidor externo que envia o alerta direto pro seu celular, mesmo com o app fechado — como no WhatsApp. Sem isso, os alertas só disparam com o app aberto.
            </p>

            {pushSubscribed ? (
              <div className="space-y-2.5">
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3 flex items-center gap-2.5">
                  <ShieldCheck className="text-emerald-400 shrink-0" size={16} />
                  <p className="text-xs font-medium text-emerald-400">Push do servidor ativo neste aparelho.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleTestPush}
                    disabled={pushTestSent}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-claude-border bg-claude-card px-3 py-2 text-xs font-semibold text-claude-text-primary hover:bg-claude-bg-hover transition-all cursor-pointer disabled:opacity-50"
                  >
                    {pushTestSent ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                    Testar Push
                  </button>
                  <button
                    onClick={handleDeactivatePush}
                    disabled={pushLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <WifiOff size={13} />
                    Desativar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://seu-servidor.onrender.com"
                  className="w-full rounded-xl border border-claude-border bg-claude-card px-3 py-2 text-xs text-claude-text-primary placeholder:text-claude-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-claude-orange"
                />
                <button
                  onClick={handleActivatePush}
                  disabled={pushLoading || !serverUrl.trim()}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-claude-orange hover:bg-[#c4613b] px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-claude-orange/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {pushLoading ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                  Ativar Push no Servidor
                </button>
              </div>
            )}

            {pushError && (
              <p className="text-[11px] text-rose-400 leading-relaxed">{pushError}</p>
            )}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="pt-3.5 border-t border-claude-border flex justify-between items-center">
          <span className="text-[10px] text-claude-text-secondary flex items-center gap-1">
            <AlertCircle size={10} />
            {pushSubscribed ? 'Sincronizado com o servidor de push' : 'Não utiliza servidores'}
          </span>

          <button
            onClick={handleTestSound}
            disabled={testActive}
            className={`flex items-center gap-1.5 rounded-xl border border-claude-border bg-claude-card px-3.5 py-1.5 text-xs font-semibold text-claude-text-primary hover:bg-claude-bg-hover transition-all cursor-pointer shadow-sm ${
              testActive ? 'scale-95 opacity-50' : 'active:scale-98'
            }`}
          >
            {settings.sound ? <Volume2 size={13} className="text-claude-text-secondary" /> : <VolumeX size={13} className="text-claude-text-secondary" />}
            Testar Alerta
          </button>
        </div>
      </div>
    </div>
  );
}
