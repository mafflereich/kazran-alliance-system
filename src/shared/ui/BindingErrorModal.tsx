import React from 'react';
import { AlertCircle, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';

interface BindingErrorModalProps {
  isOpen: boolean;
}

export const BindingErrorModal: React.FC<BindingErrorModalProps> = ({ isOpen }) => {
  const { t } = useTranslation();
  const { handleLogout } = useAppContext();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 pointer-events-auto">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-stone-200 dark:border-stone-700 animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mb-4">
            {t('auth.binding_error_title', '身份綁定出現問題')}
          </h2>
          
          <p className="text-stone-600 dark:text-stone-400 mb-8 leading-relaxed">
            {t('auth.binding_error_desc', '不用擔心，棕二玩家都應該習慣遇到BUG。請聯絡管理員跟進。')}
          </p>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-600/20 active:scale-95"
          >
            <LogOut className="w-5 h-5" />
            {t('auth.logout', '登出帳號')}
          </button>
        </div>
      </div>
    </div>
  );
};
