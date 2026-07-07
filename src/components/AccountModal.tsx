import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Trash2, Save, UserCheck } from 'lucide-react';
import { Account } from '../types';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (email: string, accountId?: string) => void;
  onDelete?: (accountId: string) => void;
  editingAccount: Account | null;
}

export default function AccountModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  editingAccount,
}: AccountModalProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (editingAccount) {
      setEmail(editingAccount.email);
    } else {
      setEmail('');
    }
    setError('');
    setShowDeleteConfirm(false);
  }, [editingAccount, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError('O e-mail é obrigatório.');
      return;
    }

    // Basic email pattern check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Por favor, informe um endereço de e-mail válido.');
      return;
    }

    onSave(cleanEmail, editingAccount?.id);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] border border-claude-border bg-claude-card p-6 sm:p-8 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-claude-border">
            <h3 className="font-display text-lg font-bold text-claude-text-primary flex items-center gap-2">
              <UserCheck className="text-claude-orange" size={18} />
              {editingAccount ? 'Editar Conta Claude' : 'Nova Conta Claude'}
            </h3>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-claude-text-secondary hover:bg-claude-bg-hover hover:text-claude-text-primary transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-claude-text-secondary">
                Endereço de E-mail da Conta
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-4 text-claude-text-secondary" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="ex: claude.pessoal@gmail.com"
                  className="w-full rounded-2xl border border-claude-border bg-claude-dark py-3.5 pl-12 pr-4 text-sm text-claude-text-primary placeholder-claude-text-secondary/50 focus:border-claude-orange focus:ring-1 focus:ring-claude-orange focus:outline-none transition-all font-sans shadow-sm"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-xs font-medium text-rose-400">{error}</p>
              )}
            </div>

            {/* Delete Option (only when editing) */}
            {editingAccount && onDelete && (
              <div className="pt-2">
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:underline transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Excluir esta conta permanentemente
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-rose-500/15 bg-rose-500/5 p-4 space-y-2.5"
                  >
                    <p className="text-xs text-rose-400 leading-relaxed">
                      Tem certeza? Todos os históricos e limites salvos para esta conta serão apagados.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="rounded-xl bg-claude-bg-hover px-3 py-1.5 text-[11px] font-semibold text-claude-text-primary hover:bg-claude-border transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(editingAccount.id);
                          onClose();
                        }}
                        className="rounded-xl bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer"
                      >
                        Sim, Excluir
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-claude-border pt-5 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl bg-claude-card border border-claude-border px-5 py-2.5 text-sm font-semibold text-claude-text-primary hover:bg-claude-bg-hover transition-all cursor-pointer shadow-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-2xl bg-claude-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-claude-orange/90 shadow-lg shadow-claude-orange/15 transition-all cursor-pointer"
              >
                <Save size={16} />
                Salvar Conta
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
