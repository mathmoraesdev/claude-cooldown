import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Sparkles, 
  Bell, 
  Clock, 
  HelpCircle, 
  Mail, 
  ListFilter,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { Account, NotificationSettings } from './types';
import { storageService } from './services/storage';
import { notificationService } from './services/notifications';
import { pushService } from './services/push';
import { getCountdownState } from './utils/time';

// Component Imports
import AccountCard from './components/AccountCard';
import AccountModal from './components/AccountModal';
import CooldownModal from './components/CooldownModal';
import NotificationSettingsCard from './components/NotificationSettingsCard';
import StatusDashboard from './components/StatusDashboard';

interface InAppToast {
  id: string;
  title: string;
  body: string;
  type: 'success' | 'warning' | 'info';
}

export default function App() {
  // --- STATE ---
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(() => storageService.getSettings());
  const [now, setNow] = useState<Date>(new Date());
  
  // Track triggered warning milestones to prevent duplicates
  const [triggeredCheckpoints, setTriggeredCheckpoints] = useState<Record<string, string[]>>({});

  // In-app toasts
  const [toasts, setToasts] = useState<InAppToast[]>([]);

  // Filters
  const [filter, setFilter] = useState<'all' | 'cooldown' | 'available'>('all');

  // Modals
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isCooldownModalOpen, setIsCooldownModalOpen] = useState(false);
  const [cooldownAccount, setCooldownAccount] = useState<Account | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    // Load accounts
    const savedAccounts = storageService.getAccounts();
    setAccounts(savedAccounts);

    // Load checkpoints
    const savedCheckpoints = storageService.getTriggeredCheckpoints();
    setTriggeredCheckpoints(savedCheckpoints);

    // Initial sync of active state with Cache Storage for Service Worker
    storageService.syncToCache();

    // Listen to background updates from Service Worker
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CHECKPOINTS_UPDATED') {
        const swCheckpoints = event.data.checkpoints;
        setTriggeredCheckpoints(swCheckpoints);
        // Save to local storage without re-triggering syncToCache recursively
        try {
          localStorage.setItem('claude_cooldown_triggered_checkpoints', JSON.stringify(swCheckpoints));
        } catch (e) {
          console.error('Failed to save background checkpoints:', e);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, []);

  // --- IN-APP TOASTS EVENT LISTENER ---
  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; body: string; type: 'success' | 'warning' | 'info' }>;
      const { title, body, type } = customEvent.detail;
      
      const newToast: InAppToast = {
        id: crypto.randomUUID(),
        title,
        body,
        type,
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto dismiss after 5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 5000);
    };

    window.addEventListener('claude-cooldown-toast', handleToastEvent);
    return () => {
      window.removeEventListener('claude-cooldown-toast', handleToastEvent);
    };
  }, []);

  // --- PRECISION TICKING ENGINE & LIVE NOTIFICATION WATCHER ---
  useEffect(() => {
    const timer = setInterval(() => {
      const currentNow = new Date();
      setNow(currentNow);

      // Evaluate notifications for all accounts in cooldown
      let updatedCheckpoints = { ...triggeredCheckpoints };
      let checkpointChanged = false;

      accounts.forEach((account) => {
        if (!account.availableAt) return;

        const countdown = getCountdownState(account.availableAt, currentNow);
        
        // Only evaluate if not already fully available (over) or if we haven't triggered the "exact" notification yet
        const accountCheckpoints = updatedCheckpoints[account.id] || [];
        
        if (!countdown.isOver || !accountCheckpoints.includes('exact')) {
          const triggered = notificationService.evaluateAndNotify(
            account.email,
            countdown.totalSeconds,
            accountCheckpoints,
            settings
          );

          if (triggered) {
            updatedCheckpoints[account.id] = [...accountCheckpoints, triggered];
            checkpointChanged = true;
          }
        }
      });

      if (checkpointChanged) {
        setTriggeredCheckpoints(updatedCheckpoints);
        storageService.saveTriggeredCheckpoints(updatedCheckpoints);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [accounts, settings, triggeredCheckpoints]);

  // --- SYNC ACCOUNTS/SETTINGS TO PUSH SERVER (no-ops if not subscribed) ---
  useEffect(() => {
    if (accounts.length === 0) return; // avoid syncing before initial load
    pushService.syncAccounts(accounts, settings);
  }, [accounts, settings]);

  // --- HANDLERS ---
  
  const handleSaveAccount = (email: string, accountId?: string) => {
    let updatedAccounts: Account[];

    if (accountId) {
      // Editing existing account
      updatedAccounts = accounts.map((acc) =>
        acc.id === accountId ? { ...acc, email } : acc
      );
    } else {
      // Creating a new account
      const newAcc: Account = {
        id: crypto.randomUUID(),
        email,
        availableAt: null,
        createdAt: new Date().toISOString(),
      };
      updatedAccounts = [...accounts, newAcc];
    }

    setAccounts(updatedAccounts);
    storageService.saveAccounts(updatedAccounts);
  };

  const handleDeleteAccount = (accountId: string) => {
    const updatedAccounts = accounts.filter((acc) => acc.id !== accountId);
    setAccounts(updatedAccounts);
    storageService.saveAccounts(updatedAccounts);

    // Clean up checkpoints
    const updatedCheckpoints = { ...triggeredCheckpoints };
    delete updatedCheckpoints[accountId];
    setTriggeredCheckpoints(updatedCheckpoints);
    storageService.saveTriggeredCheckpoints(updatedCheckpoints);

    // Clear background triggers
    notificationService.clearScheduledNotificationsForAccount(accountId);
  };

  const handleSaveCooldown = (accountId: string, availableAt: string) => {
    const updatedAccounts = accounts.map((acc) =>
      acc.id === accountId
        ? { ...acc, availableAt, createdAt: new Date().toISOString() } // Reset start time for accurate percentage tracking
        : acc
    );
    setAccounts(updatedAccounts);
    storageService.saveAccounts(updatedAccounts);

    // Reset warning checkpoints for this account's fresh cooldown period
    const updatedCheckpoints = { ...triggeredCheckpoints };
    updatedCheckpoints[accountId] = [];
    setTriggeredCheckpoints(updatedCheckpoints);
    storageService.saveTriggeredCheckpoints(updatedCheckpoints);

    // Schedule background triggers
    notificationService.scheduleAllNotificationsForAccounts(updatedAccounts, settings);
  };

  const handleClearCooldown = (accountId: string) => {
    const updatedAccounts = accounts.map((acc) =>
      acc.id === accountId ? { ...acc, availableAt: null } : acc
    );
    setAccounts(updatedAccounts);
    storageService.saveAccounts(updatedAccounts);

    // Reset checkpoints
    const updatedCheckpoints = { ...triggeredCheckpoints };
    delete updatedCheckpoints[accountId];
    setTriggeredCheckpoints(updatedCheckpoints);
    storageService.saveTriggeredCheckpoints(updatedCheckpoints);

    // Clear background triggers
    notificationService.clearScheduledNotificationsForAccount(accountId);
  };

  const handleUpdateSettings = (newSettings: NotificationSettings) => {
    setSettings(newSettings);
    storageService.saveSettings(newSettings);

    // Re-schedule background triggers with updated preferences
    notificationService.scheduleAllNotificationsForAccounts(accounts, newSettings);
  };

  // --- FILTERED ACCOUNTS ---
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const isCooling = acc.availableAt !== null && !getCountdownState(acc.availableAt, now).isOver;
      if (filter === 'cooldown') return isCooling;
      if (filter === 'available') return !isCooling;
      return true;
    });
  }, [accounts, filter, now]);

  return (
    <div className="min-h-screen bg-claude-dark text-claude-text-primary flex flex-col selection:bg-claude-orange/30">
      {/* HEADER NAVBAR */}
      <header className="sticky top-0 z-40 border-b border-claude-border bg-claude-dark/85 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
          {/* Logo Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl overflow-hidden shadow-lg shadow-claude-orange/20 border border-claude-orange/15 bg-claude-card">
              <img src={`${import.meta.env.BASE_URL}icon-192.png`} referrerPolicy="no-referrer" alt="Claude Cooldown Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-display text-base sm:text-xl font-extrabold tracking-tight text-claude-text-primary leading-tight">
                Claude Cooldown
              </h1>
              <p className="text-[9px] sm:text-[10px] font-mono tracking-widest text-claude-text-secondary uppercase">
                Limites de Uso Pessoais
              </p>
            </div>
          </div>

          {/* Action CTA Header */}
          <button
            onClick={() => {
              setEditingAccount(null);
              setIsAccountModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 sm:gap-2 rounded-2xl bg-claude-card hover:bg-claude-bg-hover px-3.5 py-2 sm:px-5 sm:py-2.5 text-xs font-bold text-claude-text-primary transition-all border border-claude-border shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Adicionar Conta</span>
            <span className="sm:hidden">Nova Conta</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        
        {/* DASHBOARD SUMMARY PANEL */}
        <StatusDashboard accounts={accounts} now={now} />

        {/* WORKSPACE ROWS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          
          {/* LEFT SIDE: ACCOUNTS LISTING (2/3 width) */}
          <div className="lg:col-span-2 space-y-5">
            
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-claude-text-secondary uppercase tracking-widest">
                <ListFilter size={14} className="text-claude-text-secondary" />
                Minhas Contas Claude
              </div>

              {/* Pill Tabs */}
              <div className="flex bg-claude-card border border-claude-border p-1 rounded-2xl shadow-sm w-full sm:w-auto">
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'cooldown', label: 'Em Cooldown' },
                  { id: 'available', label: 'Prontas' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id as any)}
                    className={`rounded-xl px-3 sm:px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer flex-1 sm:flex-initial text-center ${
                      filter === tab.id
                        ? 'bg-claude-orange text-white shadow-sm shadow-claude-orange/20'
                        : 'text-claude-text-secondary hover:text-claude-text-primary'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List rendering */}
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {filteredAccounts.length > 0 ? (
                  filteredAccounts.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      now={now}
                      onSetCooldown={(acc) => {
                        setCooldownAccount(acc);
                        setIsCooldownModalOpen(true);
                      }}
                      onEditAccount={(acc) => {
                        setEditingAccount(acc);
                        setIsAccountModalOpen(true);
                      }}
                      onClearCooldown={handleClearCooldown}
                    />
                  ))
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-[32px] border border-dashed border-claude-border bg-claude-card p-8 sm:p-12 text-center shadow-sm"
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-claude-bg-hover text-claude-text-secondary mb-4 border border-claude-border">
                      <Mail size={20} />
                    </div>
                    <h3 className="font-display font-bold text-claude-text-primary">Nenhuma conta encontrada</h3>
                    <p className="text-xs text-claude-text-secondary mt-2 max-w-sm mx-auto leading-relaxed">
                      {filter === 'all'
                        ? 'Cadastre suas contas do Claude para monitorar seus limites e configurar alertas de liberação.'
                        : 'Nenhuma conta correspondente a este filtro no momento.'}
                    </p>
                    {filter === 'all' && (
                      <button
                        onClick={() => {
                          setEditingAccount(null);
                          setIsAccountModalOpen(true);
                        }}
                        className="mt-5 inline-flex items-center gap-1.5 rounded-2xl bg-claude-orange hover:bg-[#c4613b] px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-claude-orange/20 transition-all cursor-pointer"
                      >
                        <Plus size={14} />
                        Cadastrar Primeira Conta
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT SIDE: NOTIFICATION & AUDIO SETTINGS (1/3 width) */}
          <div className="space-y-6">
            <NotificationSettingsCard 
              settings={settings} 
              onUpdateSettings={handleUpdateSettings} 
            />

            {/* Tips Card */}
            <div className="rounded-[32px] border border-claude-border bg-claude-card p-6 space-y-4 shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-claude-text-secondary flex items-center gap-1.5">
                <HelpCircle size={14} className="text-claude-text-secondary" />
                Como Funciona?
              </h4>
              <ul className="space-y-3.5 text-xs text-claude-text-secondary leading-relaxed">
                <li className="flex gap-2">
                  <span className="text-claude-orange font-bold font-mono">1.</span>
                  <span>Atingiu o limite gratuito do Claude? Veja o horário de retorno mostrado por ele (ex: <strong className="text-claude-text-primary">Try again at 18:42</strong>).</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-claude-orange font-bold font-mono">2.</span>
                  <span>Clique em <strong className="text-claude-text-primary">"Definir Horário"</strong> na conta correspondente e digite o horário informado.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-claude-orange font-bold font-mono">3.</span>
                  <span>Pronto! O aplicativo começará a contagem regressiva e disparará alertas sonoros e visuais nos momentos certos.</span>
                </li>
              </ul>
            </div>
          </div>

        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-claude-border bg-claude-card/40 py-6 sm:py-8 mt-12 text-center text-[11px] text-claude-text-secondary font-mono">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Claude Cooldown &copy; {now.getFullYear()} - Uso Pessoal</span>
          <span className="flex items-center gap-1.5 text-claude-text-secondary">
            <CheckCircle2 size={12} className="text-emerald-500" />
            100% Local, Offline e Seguro
          </span>
        </div>
      </footer>

      {/* MODALS */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onSave={handleSaveAccount}
        onDelete={handleDeleteAccount}
        editingAccount={editingAccount}
      />

      <CooldownModal
        isOpen={isCooldownModalOpen}
        onClose={() => setIsCooldownModalOpen(false)}
        onSave={handleSaveCooldown}
        account={cooldownAccount}
        now={now}
      />

      {/* IN-APP TOAST NOTIFICATIONS */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.2 } }}
              layout
              className="pointer-events-auto w-full rounded-2xl border border-claude-border bg-claude-card p-4 shadow-xl flex items-start gap-3 backdrop-blur-md relative overflow-hidden"
            >
              {/* Colored left accent bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                toast.type === 'success' 
                  ? 'bg-emerald-500' 
                  : toast.type === 'warning' 
                    ? 'bg-amber-500' 
                    : 'bg-claude-orange'
              }`} />
              
              {/* Icon */}
              <div className="shrink-0 mt-0.5 ml-1">
                {toast.type === 'success' && <CheckCircle2 className="text-emerald-400" size={16} />}
                {toast.type === 'warning' && <AlertCircle className="text-amber-400" size={16} />}
                {toast.type === 'info' && <Bell className="text-claude-orange" size={16} />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="text-xs font-bold text-claude-text-primary">
                  {toast.title}
                </h4>
                <p className="text-[11px] text-claude-text-secondary mt-1 leading-relaxed">
                  {toast.body}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="absolute right-2 top-2.5 rounded-lg p-1 text-claude-text-secondary hover:bg-claude-bg-hover hover:text-claude-text-primary transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
