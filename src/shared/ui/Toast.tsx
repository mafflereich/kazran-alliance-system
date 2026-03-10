import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useAppContext } from '@/store';
import { ToastType } from '@/entities/member/types';

const toastConfig: Record<ToastType, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  success: {
    icon: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    color: 'text-emerald-900 dark:text-emerald-200',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-800'
  },
  error: {
    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    color: 'text-red-900 dark:text-red-200',
    bg: 'bg-red-50 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-800'
  },
  info: {
    icon: <Info className="w-5 h-5 text-blue-500" />,
    color: 'text-blue-900 dark:text-blue-200',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    border: 'border-blue-200 dark:border-blue-800'
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    color: 'text-amber-900 dark:text-amber-200',
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-800'
  }
};

export default function ToastContainer() {
  const { toasts, removeToast } = useAppContext();

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const config = toastConfig[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95, transition: { duration: 0.2 } }}
              className={`
                pointer-events-auto flex items-center gap-3 p-4 pr-10 rounded-xl border shadow-lg
                ${config.bg} ${config.border} ${config.color}
                min-w-[300px] max-w-md relative
              `}
            >
              <div className="shrink-0">{config.icon}</div>
              <div className="text-sm font-medium leading-tight">{toast.message}</div>
              <button
                onClick={() => removeToast(toast.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-4 h-4 opacity-50" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
