import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MemberClaimPanel from './MemberClaimPanel';

/**
 * 「我的遊戲帳號」彈窗：已綁定後仍可再新增其他遊戲帳號（多重綁定）。
 */
export default function MyAccountsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-stone-200 dark:border-stone-700 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {t('header.my_accounts', '我的遊戲帳號')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-500 transition-colors"
            aria-label={t('common.close', '關閉')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <MemberClaimPanel />
      </div>
    </div>
  );
}
