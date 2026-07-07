import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, Sparkles, Check, AlertCircle, Plus, Info } from 'lucide-react';
import { Account } from '../types';
import { parseTimeString, getCountdownState } from '../utils/time';

interface CooldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (accountId: string, availableAt: string) => void;
  account: Account | null;
  now: Date;
}

export default function CooldownModal({
  isOpen,
  onClose,
  onSave,
  account,
  now,
}: CooldownModalProps) {
  const [timeInput, setTimeInput] = useState('');
  const [parsedDate, setParsedDate] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // When modal opens or account changes, pre-fill if there's an existing cooldown
  useEffect(() => {
    if (isOpen && account) {
      if (account.availableAt) {
        const date = new Date(account.availableAt);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        setTimeInput(`${hours}:${minutes}`);
      } else {
        // Default to a blank clean state
        setTimeInput('');
      }
    }
  }, [account, isOpen]);

  // Live parsing trigger
  useEffect(() => {
    if (timeInput) {
      const parsed = parseTimeString(timeInput, now);
      setParsedDate(parsed);
      if (parsed) {
        setErrorMessage('');
      } else {
        // Set light typing feedback instead of full red error
        setErrorMessage('Formato inválido. Use ex: "18:42", "6:42 PM", "6:42"');
      }
    } else {
      setParsedDate(null);
      setErrorMessage('');
    }
  }, [timeInput, now]);

  if (!isOpen || !account) return null;

  const handleSave = () => {
    if (!parsedDate) {
      setErrorMessage('Por favor, informe um horário válido.');
      return;
    }
    onSave(account.id, parsedDate.toISOString());
    onClose();
  };

  // Helper to add duration to current time and format as input
  const applyOffset = (hoursToAdd: number) => {
    const futureDate = new Date(now);
    futureDate.setHours(futureDate.getHours() + hoursToAdd);
    const h = futureDate.getHours().toString().padStart(2, '0');
    const m = futureDate.getMinutes().toString().padStart(2, '0');
    setTimeInput(`${h}:${m}`);
  };

  // Human-readable resolution summary
  const getResolutionSummary = () => {
    if (!parsedDate) return null;
    const diffMs = parsedDate.getTime() - now.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;

    const isTomorrow = parsedDate.getDate() !== now.getDate();
    const dayText = isTomorrow ? 'Amanhã' : 'Hoje';

    const timeFormatted = parsedDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    let durationText = '';
    if (h > 0) {
      durationText = `${h}h ${m}m`;
    } else {
      durationText = `${m}m`;
    }

    return {
      dayText,
      timeFormatted,
      durationText,
      isTomorrow,
    };
  };

  const summary = getResolutionSummary();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal body */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] border border-claude-border bg-claude-card p-6 sm:p-8 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-claude-border">
            <div>
              <h3 className="font-display text-lg font-bold text-claude-text-primary flex items-center gap-2">
                <Clock className="text-claude-orange animate-pulse" size={18} />
                Definir Cooldown
              </h3>
              <p className="text-xs text-claude-text-secondary mt-0.5">{account.email}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-claude-text-secondary hover:bg-claude-bg-hover hover:text-claude-text-primary transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 space-y-5">
            {/* Context Notice */}
            <div className="rounded-2xl border border-claude-border bg-claude-bg-hover/30 p-4 flex gap-2.5 items-start">
              <Info className="text-claude-text-secondary shrink-0 mt-0.5" size={15} />
              <p className="text-xs text-claude-text-secondary leading-relaxed">
                Digite exatamente o <strong className="text-claude-text-primary">horário de liberação</strong> informado pelo Claude (ex: <span className="font-mono text-claude-orange font-semibold">18:42</span> ou <span className="font-mono text-claude-orange font-semibold">6:42 PM</span>). O app calcula os alertas e cronômetros automaticamente.
              </p>
            </div>

            {/* Quick Presets (Adds simulated delay) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-claude-text-secondary">
                Atalhos de tempo (a partir de agora)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 4, 8].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => applyOffset(hours)}
                    className="flex items-center justify-center gap-1 rounded-xl border border-claude-border bg-claude-card py-2.5 text-xs font-semibold text-claude-text-primary hover:border-claude-orange/40 hover:bg-claude-orange/5 hover:text-claude-orange transition-all cursor-pointer shadow-sm"
                  >
                    <Plus size={10} />
                    {hours}h
                  </button>
                ))}
              </div>
            </div>

            {/* Main Time Input Field */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-claude-text-secondary">
                Horário informado pelo Claude
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  placeholder="ex: 18:42"
                  className="w-full rounded-2xl border border-claude-border bg-claude-dark py-4 px-5 text-center font-mono text-2xl font-bold text-claude-orange placeholder-claude-text-secondary/30 focus:border-claude-orange focus:outline-none focus:ring-1 focus:ring-claude-orange transition-all shadow-sm"
                  autoFocus
                  maxLength={10}
                />
              </div>
            </div>

            {/* Smart Resolution Visual Preview */}
            <div className="min-h-[76px] rounded-2xl bg-claude-dark/40 border border-claude-border p-4 flex items-center justify-center">
              {summary ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-claude-text-secondary">Cálculo Automático</span>
                    <div className="text-sm font-semibold text-claude-text-primary">
                      Liberar {summary.dayText} às <span className="font-mono text-claude-text-primary font-bold">{summary.timeFormatted}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-claude-text-secondary">Espera</span>
                    <span className="font-mono text-sm font-bold text-amber-400 bg-amber-500/10 border border-amber-500/15 px-2.5 py-0.5 rounded-lg">
                      {summary.durationText}
                    </span>
                  </div>
                </motion.div>
              ) : (
                <div className="text-center text-xs text-claude-text-secondary flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-claude-text-secondary animate-pulse" />
                  {errorMessage || 'Aguardando digitação...'}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-claude-border pt-5 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl bg-claude-card border border-claude-border px-5 py-2.5 text-sm font-semibold text-claude-text-primary hover:bg-claude-bg-hover transition-all cursor-pointer shadow-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!parsedDate}
                className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold transition-all cursor-pointer shadow-md ${
                  parsedDate
                    ? 'bg-claude-orange text-white hover:bg-claude-orange/90 shadow-claude-orange/15'
                    : 'bg-claude-dark text-claude-text-secondary/50 border border-claude-border cursor-not-allowed'
                }`}
              >
                <Check size={16} />
                Iniciar Cooldown
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
