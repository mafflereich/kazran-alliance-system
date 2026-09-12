import { useState } from 'react';
import { Ghost, X, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Member } from '@/entities/member/types';
import ConfirmModal from '@shared/ui/ConfirmModal';

interface GhostRecordModalProps {
  member: Member;
  ghostRecords: Record<string, any[]>;
  onAddGhostRecord?: (memberId: string) => void;
  onDeleteGhostRecord?: (memberId: string, record: any) => void;
  onClose: () => void;
}

export default function GhostRecordModal({
  member,
  ghostRecords,
  onAddGhostRecord,
  onDeleteGhostRecord,
  onClose,
}: GhostRecordModalProps) {
  const { t } = useTranslation(['raid', 'translation']);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-stone-200 dark:border-stone-700">
          <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-stone-700">
            <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100 flex items-center gap-2">
              <Ghost className="w-5 h-5 text-amber-500" />
              {member.name} - {t('raid.ghost_log_title', '招魂紀錄')}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onAddGhostRecord?.(member.id!)}
                className="px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1"
              >
                <Ghost className="w-4 h-4" />
                {t('raid.ghost_log_button', '招魂')}
              </button>
              <button
                onClick={onClose}
                className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {ghostRecords[member.id!]?.length ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-700">
                    <th className="py-2 font-medium text-stone-500 dark:text-stone-400">
                      {t('alliance_raid.season_label', '賽季')}
                    </th>
                    <th className="py-2 font-medium text-stone-500 dark:text-stone-400">
                      {t('common.date', '日期')}
                    </th>
                    <th className="py-2 font-medium text-stone-500 dark:text-stone-400 w-10 text-center">
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...ghostRecords[member.id!]]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((record, idx) => (
                      <tr key={record.uid || idx} className="border-b border-stone-100 dark:border-stone-700/50 group/ghost">
                        <td className="py-2 text-stone-800 dark:text-stone-200">
                          {record.season_number ? `S${record.season_number}` : '-'}
                        </td>
                        <td className="py-2 text-stone-600 dark:text-stone-400">
                          {new Date(record.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: t('raid.ghost_log_delete_title', '刪除招魂紀錄'),
                                message: t('raid.ghost_log_delete_desc', '確定要刪除這筆招魂紀錄嗎？此操作無法復原。'),
                                onConfirm: () => {
                                  onDeleteGhostRecord?.(member.id!, record);
                                  closeConfirmModal();
                                }
                              });
                            }}
                            className="p-1 text-stone-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover/ghost:opacity-100 transition-all"
                            title={t('common.delete', '刪除')}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-stone-500 dark:text-stone-400">
                <Ghost className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>{t('raid.ghost_log_empty', '目前沒有招魂紀錄')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
      />
    </>
  );
}
