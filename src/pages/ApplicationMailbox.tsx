import React, { useState } from 'react';
import { useAppContext } from '../store';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { 
  Mail, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle, 
  XCircle, 
  MessageCircle, 
  Plus, 
  Send,
  AlertCircle,
  Clock
} from 'lucide-react';

type ApplicationSubject = 'leave' | 'tier_change' | 'reserved_seat' | 'other';
type ApplicationStatus = 'pending' | 'acknowledged' | 'rejected' | 'discuss';

interface Application {
  id: string;
  date: string;
  subject: ApplicationSubject;
  content: string;
  status: ApplicationStatus;
}

const MOCK_APPLICATIONS: Application[] = Array.from({ length: 45 }).map((_, i) => ({
  id: `app-${i}`,
  date: new Date(Date.now() - i * 86400000).toLocaleString('zh-TW', { hour12: false }).replace(/\//g, '/'),
  subject: ['leave', 'tier_change', 'reserved_seat', 'other'][i % 4] as ApplicationSubject,
  content: `這是第 ${i + 1} 則申請內容。\n我是來自 Guild A 的 Player ${i}。\n希望能夠申請...`,
  status: ['pending', 'acknowledged', 'rejected', 'discuss'][i % 4] as ApplicationStatus,
}));

export default function ApplicationMailbox() {
  const { t } = useTranslation();
  const { currentUser, db } = useAppContext();
  const [applications, setApplications] = useState<Application[]>(MOCK_APPLICATIONS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [formData, setFormData] = useState({
    subject: 'leave' as ApplicationSubject,
    content: ''
  });

  const totalPages = Math.ceil(applications.length / itemsPerPage);
  const currentApplications = applications.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );

  const getSubjectLabel = (subject: ApplicationSubject) => {
    switch (subject) {
      case 'leave': return t('mailbox.subject_leave', '請假');
      case 'tier_change': return t('mailbox.subject_tier_change', '升降梯隊');
      case 'reserved_seat': return t('mailbox.subject_reserved_seat', '保留席');
      case 'other': return t('mailbox.subject_other', '其他');
      default: return subject;
    }
  };

  const getStatusIcon = (status: ApplicationStatus) => {
    switch (status) {
      case 'acknowledged':
        return <span title={t('mailbox.status_acknowledged', '知道')}><CheckCircle className="w-5 h-5 text-green-500" /></span>;
      case 'rejected':
        return <span title={t('mailbox.status_rejected', '拒絕')}><XCircle className="w-5 h-5 text-red-500" /></span>;
      case 'discuss':
        return <span title={t('mailbox.status_discuss', '詳談')}><MessageCircle className="w-5 h-5 text-amber-500" /></span>;
      default:
        return <span title={t('mailbox.status_pending', '待處理')}><Clock className="w-5 h-5 text-stone-400" /></span>;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock submission
    const newApp: Application = {
      id: `new-${Date.now()}`,
      date: new Date().toLocaleString('zh-TW', { hour12: false }).replace(/\//g, '/'),
      subject: formData.subject,
      content: formData.content,
      status: 'pending'
    };
    setApplications([newApp, ...applications]);
    setIsModalOpen(false);
    setFormData({ subject: 'leave', content: '' });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900 flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
            <Mail className="w-6 h-6 text-amber-600" />
            {t('mailbox.title', '申請信箱')}
          </h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('mailbox.submit_application', '提出申請')}
          </button>
        </div>

        <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600">
                  <th className="p-4 font-semibold w-48">{t('mailbox.date', '申請日期')}</th>
                  <th className="p-4 font-semibold w-32">{t('mailbox.subject', '主題')}</th>
                  <th className="p-4 font-semibold">{t('mailbox.content', '內容')}</th>
                  <th className="p-4 font-semibold w-24 text-center">{t('mailbox.reply', '回覆')}</th>
                </tr>
              </thead>
              <tbody>
                {currentApplications.map((app) => (
                  <React.Fragment key={app.id}>
                    <tr 
                      className="border-b border-stone-100 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(app.id)}
                    >
                      <td className="p-4 text-sm text-stone-500 dark:text-stone-400 font-mono">
                        {app.date}
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium
                          ${app.subject === 'leave' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                            app.subject === 'tier_change' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                            app.subject === 'reserved_seat' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                            'bg-stone-100 text-stone-800 dark:bg-stone-700 dark:text-stone-300'
                          }`}>
                          {getSubjectLabel(app.subject)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-stone-800 dark:text-stone-200">
                          <span className="truncate max-w-md block">{app.content.split('\n')[0]}</span>
                          {expandedId === app.id ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center">
                          {getStatusIcon(app.status)}
                        </div>
                      </td>
                    </tr>
                    {expandedId === app.id && (
                      <tr className="bg-stone-50 dark:bg-stone-700/30">
                        <td colSpan={4} className="p-4 border-b border-stone-100 dark:border-stone-700">
                          <div className="bg-white dark:bg-stone-800 p-4 rounded-lg border border-stone-200 dark:border-stone-600 whitespace-pre-wrap text-stone-700 dark:text-stone-300">
                            {app.content}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="p-4 border-t border-stone-200 dark:border-stone-600 flex justify-between items-center">
            <div className="text-sm text-stone-500 dark:text-stone-400">
              {t('common.page', '頁碼')} {currentPage} / {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-stone-100 dark:bg-stone-700 rounded hover:bg-stone-200 dark:hover:bg-stone-600 disabled:opacity-50 transition-colors"
              >
                {t('common.prev_page', '上一頁')}
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-stone-100 dark:bg-stone-700 rounded hover:bg-stone-200 dark:hover:bg-stone-600 disabled:opacity-50 transition-colors"
              >
                {t('common.next_page', '下一頁')}
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Submit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-stone-200 dark:border-stone-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200">
                {t('mailbox.submit_application', '提出申請')}
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
                <p>{t('mailbox.submit_hint', '請在內容中註明您的公會名稱和遊戲暱稱，以便管理員處理。')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('mailbox.subject', '主題')}
                </label>
                <select
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value as ApplicationSubject})}
                  className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none dark:bg-stone-700 dark:text-stone-100"
                >
                  <option value="leave">{t('mailbox.subject_leave', '請假')}</option>
                  <option value="tier_change">{t('mailbox.subject_tier_change', '升降梯隊')}</option>
                  <option value="reserved_seat">{t('mailbox.subject_reserved_seat', '保留席')}</option>
                  <option value="other">{t('mailbox.subject_other', '其他')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('mailbox.content', '內容')}
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  required
                  rows={6}
                  placeholder={t('mailbox.content_placeholder', '請輸入申請內容...')}
                  className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none dark:bg-stone-700 dark:text-stone-100 resize-none"
                />
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
    </div>
  );
}
