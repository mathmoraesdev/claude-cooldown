import { motion } from 'motion/react';
import { Shield, Clock, CheckCircle2, Sparkles, Hourglass } from 'lucide-react';
import { Account } from '../types';
import { getCountdownState } from '../utils/time';

interface StatusDashboardProps {
  accounts: Account[];
  now: Date;
}

export default function StatusDashboard({ accounts, now }: StatusDashboardProps) {
  const total = accounts.length;
  const availableCount = accounts.filter(
    (a) => !a.availableAt || getCountdownState(a.availableAt, now).isOver
  ).length;
  const cooldownCount = total - availableCount;

  // Find the next account to be released
  const cooldownAccounts = accounts
    .filter((a) => a.availableAt && !getCountdownState(a.availableAt, now).isOver)
    .map((a) => ({
      account: a,
      state: getCountdownState(a.availableAt, now),
    }))
    .sort((a, b) => a.state.totalSeconds - b.state.totalSeconds);

  const nextRelease = cooldownAccounts.length > 0 ? cooldownAccounts[0] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6"
    >
      {/* Cards 1: Available Accounts */}
      <div className="rounded-[32px] border border-claude-border bg-claude-card p-5 sm:p-6 flex items-center justify-between relative overflow-hidden shadow-sm">
        <div className="space-y-1 z-10">
          <span className="text-xs font-semibold text-claude-text-secondary uppercase tracking-widest">Disponíveis</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold font-display text-emerald-400">{availableCount}</span>
            <span className="text-xs text-claude-text-secondary">de {total} contas</span>
          </div>
          <p className="text-[11px] text-claude-text-secondary">Prontas para uso imediato</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 z-10">
          <CheckCircle2 className="text-emerald-400" size={22} />
        </div>
        <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-emerald-500/5 blur-xl pointer-events-none" />
      </div>

      {/* Card 2: Cooldown Accounts */}
      <div className="rounded-[32px] border border-claude-border bg-claude-card p-5 sm:p-6 flex items-center justify-between relative overflow-hidden shadow-sm">
        <div className="space-y-1 z-10">
          <span className="text-xs font-semibold text-claude-text-secondary uppercase tracking-widest">Em Espera</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold font-display text-amber-400">{cooldownCount}</span>
            <span className="text-xs text-claude-text-secondary">contas pausadas</span>
          </div>
          <p className="text-[11px] text-claude-text-secondary">Aguardando temporizador</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/15 z-10">
          <Hourglass className="text-amber-400 animate-spin-slow" size={22} />
        </div>
        <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />
      </div>

      {/* Card 3: Proactive Next Release Status */}
      <div className="rounded-[32px] border border-claude-orange/20 bg-claude-orange/5 p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden shadow-sm">
        {nextRelease ? (
          <>
            <div className="flex items-start justify-between gap-3 z-10">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-claude-orange uppercase tracking-widest">Próxima Liberação</span>
                <p className="text-xs text-claude-text-primary truncate max-w-[150px] sm:max-w-[180px] font-semibold" title={nextRelease.account.email}>
                  {nextRelease.account.email}
                </p>
              </div>
              <div className="font-mono text-sm font-bold text-claude-orange bg-claude-orange/10 border border-claude-orange/20 px-3 py-1 rounded-xl shrink-0">
                {nextRelease.state.formatted}
              </div>
            </div>
            <div className="text-[11px] text-claude-orange/90 mt-2.5 z-10 flex items-center gap-1 font-medium">
              <Sparkles size={11} className="text-claude-orange shrink-0 animate-pulse" />
              Prepare o prompt para esta conta!
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col justify-center items-center text-center p-2 z-10">
            <CheckCircle2 size={22} className="text-claude-orange mb-1" />
            <p className="text-xs font-bold text-claude-text-primary">Todas as Contas Disponíveis!</p>
            <p className="text-[10px] text-claude-text-secondary mt-0.5">Nenhum cooldown ativo no momento.</p>
          </div>
        )}
        <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-claude-orange/10 blur-xl pointer-events-none" />
      </div>
    </motion.div>
  );
}
