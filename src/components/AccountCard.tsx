import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Clock, Edit2, CheckCircle2, RotateCcw, AlertTriangle, ChevronRight } from 'lucide-react';
import { Account } from '../types';
import { getCountdownState, getCooldownProgress, formatLocalTime } from '../utils/time';

interface AccountCardProps {
  account: Account;
  now: Date;
  onSetCooldown: (account: Account) => void;
  onEditAccount: (account: Account) => void;
  onClearCooldown: (accountId: string) => void;
}

export default function AccountCard({
  account,
  now,
  onSetCooldown,
  onEditAccount,
  onClearCooldown,
}: AccountCardProps) {
  const [countdown, setCountdown] = useState(getCountdownState(account.availableAt, now));
  const [progress, setProgress] = useState(getCooldownProgress(account.createdAt, account.availableAt, now));

  useEffect(() => {
    setCountdown(getCountdownState(account.availableAt, now));
    setProgress(getCooldownProgress(account.createdAt, account.availableAt, now));
  }, [account.availableAt, account.createdAt, now]);

  const isCooldown = account.availableAt !== null && !countdown.isOver;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden rounded-[32px] border bg-claude-card p-6 sm:p-8 transition-all duration-300 shadow-sm ${
        isCooldown
          ? 'border-amber-500/30 shadow-md shadow-amber-500/5 hover:border-amber-500/50'
          : 'border-claude-border hover:border-claude-orange/30 hover:shadow-md'
      }`}
    >
      {/* Background radial gradient indicator */}
      <div
        className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl transition-opacity duration-500 ${
          isCooldown ? 'bg-amber-500/5' : 'bg-claude-orange/5'
        }`}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Account Info and Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                isCooldown ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            <span className="font-display font-semibold text-lg sm:text-xl tracking-tight text-claude-text-primary">
              {account.email}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isCooldown ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-tight text-amber-400 border border-amber-500/15">
                  <AlertTriangle size={11} />
                  Em Cooldown
                </span>
                <span className="text-xs text-claude-text-secondary font-mono">
                  Liberação: <strong className="text-claude-text-primary font-semibold">{formatLocalTime(account.availableAt!)}</strong>
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-tight text-emerald-400 border border-emerald-500/15">
                <CheckCircle2 size={11} />
                Disponível
              </span>
            )}

          </div>
        </div>

        {/* Countdown display */}
        {isCooldown && (
          <div className="flex flex-col items-start md:items-end">
            <span className="text-[10px] text-claude-text-secondary font-semibold tracking-widest uppercase">Falta</span>
            <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tighter text-amber-400">
              {countdown.formatted}
            </span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {isCooldown && (
        <div className="mt-6 space-y-2">
          <div className="h-3 w-full overflow-hidden rounded-full bg-claude-bg-hover">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-claude-text-secondary font-mono uppercase tracking-wider">
            <span>Início</span>
            <span className="text-claude-text-primary font-semibold">{Math.round(progress)}% Concluído</span>
            <span>Pronto</span>
          </div>
        </div>
      )}

      {/* Action footer */}
      <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-claude-border pt-5">
        {/* Left Side: Secondary actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEditAccount(account)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-claude-text-secondary hover:bg-claude-bg-hover hover:text-claude-text-primary transition-colors cursor-pointer"
            title="Editar informações da conta"
          >
            <Edit2 size={13} />
            Configurar Conta
          </button>
        </div>

        {/* Right Side: Primary interactive CTA */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {isCooldown ? (
            <>
              <button
                onClick={() => onClearCooldown(account.id)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-claude-border bg-claude-card px-4 py-2 text-xs font-medium text-claude-text-primary hover:bg-claude-bg-hover transition-all cursor-pointer shadow-sm flex-1 sm:flex-none"
              >
                <RotateCcw size={13} />
                Liberar
              </button>
              <button
                onClick={() => onSetCooldown(account)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/15 px-4.5 py-2 text-xs font-semibold text-amber-400 transition-all cursor-pointer flex-1 sm:flex-none"
              >
                Ajustar Horário
                <ChevronRight size={13} />
              </button>
            </>
          ) : (
            <button
              onClick={() => onSetCooldown(account)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-claude-orange hover:bg-claude-orange/90 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-claude-orange/15 transition-all cursor-pointer w-full sm:w-auto"
            >
              <Clock size={13} />
              Definir Horário de Liberação
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
