import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/store';
import { useTranslation } from 'react-i18next';
import { logEvent } from '@/analytics';
import { formatDate } from '@/shared/lib/utils';
import {
  Mail,
  CheckCircle,
  XCircle,
  MessageCircle,
  Plus,
  Send,
  AlertCircle,
  Clock,
  Trash2,
  HelpCircle,
  Fingerprint,
} from 'lucide-react';

type ApplicationSubject = 'leave' | 'tier_change' | 'reserved_seat' | 'id_change';
type ApplicationStatus = 'pending' | 'acknowledged' | 'rejected' | 'discuss' | 'unclear' | 'who_are_you';

export default function ApplicationMailbox() {
  const { t } = useTranslation(['mailbox', 'translation']);
  const { db, fetchApplyMails, addApplyMail, updateApplyMail, deleteApplyMail, showToast, userRole } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const [formData, setFormData] = useState({
    subject: 'leave' as ApplicationSubject,
    content: ''
  });

  useEffect(() => {
    fetchApplyMails();
  }, []);

  const applications = Object.values(db.applyMails || {}).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredApplications = applications.filter(app => {
    if (filter === 'all') return true;
    if (filter === 'pending') return app.status === 'pending';
    return app.subject === filter;
  });

  const isPrivileged = userRole === 'creator' || userRole === 'admin' || userRole === 'manager';

  const totalPages = Math.ceil(filteredApplications.length / itemsPerPage);
  const currentApplications = filteredApplications.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getSubjectLabel = (subject: string) => {
    switch (subject) {
      case 'leave': return t('mailbox:subject_leave', '請假');
      case 'tier_change': return t('mailbox:subject_tier_change', '升降梯隊');
      case 'reserved_seat': return t('mailbox:subject_reserved_seat', '保留席');
      case 'id_change': return t('mailbox:subject_id_change', 'ID更改/修正');
      default: return subject;
    }
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { label: string, color: string, icon: React.ReactNode }> = {
      'pending': { label: t('mailbox:status_pending', '待處理'), color: 'text-stone-400', icon: <Clock className="w-4 h-4" /> },
      'acknowledged': { label: t('mailbox:status_acknowledged', '已知悉'), color: 'text-green-600', icon: <CheckCircle className="w-4 h-4" /> },
      'rejected': { label: t('mailbox:status_rejected', '拒絕'), color: 'text-red-600', icon: <XCircle className="w-4 h-4" /> },
      'discuss': { label: t('mailbox:status_discuss_full', '請到 Discord 聯絡總長'), color: 'text-amber-600', icon: <MessageCircle className="w-4 h-4" /> },
      'unclear': { label: t('mailbox:status_unclear_full', '意義不明。不受理，請重新申請'), color: 'text-purple-600', icon: <HelpCircle className="w-4 h-4" /> },
      'who_are_you': { label: t('mailbox:status_who_are_you_full', '你是誰？不受理，請重新申請'), color: 'text-blue-600', icon: <Fingerprint className="w-4 h-4" /> },
    };

    const s = statusMap[status] || statusMap['pending'];
    return (
      <div className={`flex items-center gap-1.5 ${s.color} dark:text-opacity-80`}>
        {s.icon}
        <span className="text-xs font-medium">{s.label}</span>
      </div>
    );
  };

  const openModal = () => {
    const lastSubmitTime = localStorage.getItem('last_application_submit_time');
    if (lastSubmitTime) {
      const timeDiff = Date.now() - parseInt(lastSubmitTime, 10);
      const cooldown = 5 * 60 * 1000;
      if (timeDiff < cooldown) {
        const minutesLeft = Math.ceil((cooldown - timeDiff) / (60 * 1000));
        showToast(t('mailbox:submit_cooldown', { minutes: minutesLeft }), 'error');
        return;
      }
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await addApplyMail(formData.subject, formData.content);
      logEvent('Mailbox', 'Submit Application', formData.subject);
      localStorage.setItem('last_application_submit_time', Date.now().toString());
      setIsModalOpen(false);
      setFormData({ subject: 'leave', content: '' });
      showToast(t('mailbox:submit_success', '提交成功'), 'success');
    } catch (err) {
      showToast(t('mailbox:submit_failed', '提交失敗'), 'error');
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: ApplicationStatus) => {
    try {
      await updateApplyMail(id, { status: newStatus });
      logEvent('Mailbox', 'Update Status', newStatus);
      showToast(t('mailbox:update_success', '更新成功'), 'success');
    } catch (err) {
      showToast(t('mailbox:update_failed', '更新失敗'), 'error');
    }
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItemToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteApplyMail(itemToDelete);
      logEvent('Mailbox', 'Delete Application', itemToDelete);
      showToast(t('mailbox:delete_success', '刪除成功'), 'success');
      setDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (err) {
      showToast(t('mailbox:delete_failed', '刪除失敗'), 'error');
    }
  };

  const getSubjectColor = (subject: string) => {
    switch (subject) {
      case 'leave': return 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800';
      case 'tier_change': return 'bg-red-100 dark:bg-red-900/10 border-red-200 dark:border-red-800';
      case 'reserved_seat': return 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800';
      case 'id_change': return 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800';
      default: return 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700';
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900 flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
            <Mail className="w-6 h-6 text-amber-600" />
            {t('mailbox:title', '申請信箱')}
          </h1>
          <button
            onClick={openModal}
            className="px-3 py-1.5 text-sm md:px-4 md:py-2 md:text-base bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('mailbox:submit_application', '提出申請')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setFilter('all')} className={`px-3 py-1 rounded-full text-sm ${filter === 'all' ? 'bg-amber-600 text-white' : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'}`}>{t('mailbox:filter_all', '全部')}</button>
          <button onClick={() => setFilter('pending')} className={`px-3 py-1 rounded-full text-sm ${filter === 'pending' ? 'bg-amber-600 text-white' : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'}`}>
            {t('mailbox:status_pending', '待處理')} ({applications.filter(a => a.status === 'pending').length})
          </button>
          {['leave', 'tier_change', 'reserved_seat', 'id_change'].map(subject => (
            <button key={subject} onClick={() => setFilter(subject)} className={`px-3 py-1 rounded-full text-sm ${filter === subject ? 'bg-amber-600 text-white' : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'}`}>
              {getSubjectLabel(subject)}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {currentApplications.map((app) => (
            <div key={app.id} className={`p-4 rounded-xl shadow-sm border ${getSubjectColor(app.subject)}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-stone-500 dark:text-stone-400 font-mono">
                  {formatDate(app.createdAt)}
                </span>
                <div className="text-sm font-medium">
                  {getStatusDisplay(app.status)}
                </div>
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-stone-800 dark:text-stone-200 mb-1">
                    {getSubjectLabel(app.subject)}
                  </h4>
                  <p className="text-stone-700 dark:text-stone-300 whitespace-pre-wrap text-sm">
                    {app.content}
                  </p>
                </div>
                {isPrivileged && (
                  <div className="flex flex-col gap-2 ml-4 items-end">
                    <select
                      value={app.status}
                      onChange={(e) => handleStatusUpdate(app.id, e.target.value as ApplicationStatus)}
                      className="text-xs p-1 border border-stone-300 dark:border-stone-600 rounded bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-200 outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="pending">{t('mailbox:status_pending', '待處理')}</option>
                      <option value="acknowledged">{t('mailbox:status_acknowledged', '已知悉')}</option>
                      <option value="rejected">{t('mailbox:status_rejected', '拒絕')}</option>
                      <option value="discuss">{t('mailbox:status_discuss', '聯絡總長')}</option>
                      <option value="unclear">{t('mailbox:status_unclear', '意義不明')}</option>
                      <option value="who_are_you">{t('mailbox:status_who_are_you', '你是誰？')}</option>
                    </select>
                    <button
                      onClick={(e) => handleDeleteClick(app.id, e)}
                      className="p-1.5 text-stone-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title={t('common.delete', '刪除')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="mt-6 flex justify-between items-center">
          <div className="text-sm text-stone-500 dark:text-stone-400">
            {t('common.page', '頁碼')} {currentPage} / {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
            >
              {t('common.prev_page', '上一頁')}
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
            >
              {t('common.next_page', '下一頁')}
            </button>
          </div>
        </div>
      </main>

      {/* Submit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-stone-200 dark:border-stone-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200">
                {t('mailbox:submit_application', '提出申請')}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex gap-3 text-sm text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{t('mailbox:submit_hint', '請在內容中註明您的公會名稱和遊戲暱稱，以便管理員處理。')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('mailbox:subject', '主題')}
                </label>
                <select
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value as ApplicationSubject })}
                  className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
                >
                  <option value="leave">{t('mailbox:subject_leave', '請假')}</option>
                  <option value="tier_change">{t('mailbox:subject_tier_change', '升降梯隊')}</option>
                  <option value="reserved_seat">{t('mailbox:subject_reserved_seat', '保留席')}</option>
                  <option value="id_change">{t('mailbox:subject_id_change', 'ID更改/修正')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('mailbox:content', '內容')}
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                  rows={6}
                  maxLength={500}
                  placeholder={t('mailbox:content_placeholder', '請輸入申請內容...')}
                  className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100 resize-none"
                />
                <div className="text-right text-xs text-stone-500 dark:text-stone-400 mt-1">
                  {formData.content.length}/500
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  {t('common.submit', '送出')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-stone-800 dark:text-stone-200 mb-2">
                {t('common.confirm_delete', '確認刪除')}
              </h3>
              <p className="text-stone-600 dark:text-stone-400 mb-6">
                {t('mailbox:delete_confirm_msg', '確定要刪除此申請嗎？此動作無法復原。')}
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                >
                  {t('common.delete', '刪除')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
