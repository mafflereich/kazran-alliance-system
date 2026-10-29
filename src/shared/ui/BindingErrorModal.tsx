import React from 'react';
import { AlertCircle, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import MemberClaimPanel from '@/features/auth/components/MemberClaimPanel';

interface BindingErrorModalProps {
  isOpen: boolean;
}

/**
 * 「尚未綁定任何成員」時擋住畫面。
 *
 * 內容是 MemberClaimPanel —— 可以一次申請多個遊戲帳號
 * （一個 Discord 對多個遊戲帳號是正常需求，例如分身 / 轉服）。
 */
export const BindingErrorModal: React.FC<BindingErrorModalProps> = ({ isOpen }) => {
  const { t } = useTranslation();
  const { handleLogout } = useAppContext();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 pointer-events-auto overflow-y-auto">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 border border-stone-200 dark:border-stone-700 my-8">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-2">
            {t('auth.claim_title', '先認領你的成員資料')}
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
            {t('auth.claim_desc_multi', '你的 Discord 帳號還沒有對應到任何成員。請輸入遊戲內名稱認領自己；如果你有多個遊戲帳號，可以一次申請多個。')}
          </p>
        </div>

        <MemberClaimPanel />

        <button
          onClick={handleLogout}
          className="mt-5 w-full flex items-center justify-center gap-2 px-6 py-3 bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 rounded-xl font-bold transition-all active:scale-95"
        >
          <LogOut className="w-5 h-5" />
          {t('auth.logout', '登出帳號')}
        </button>
      </div>
    </div>
  );
};
