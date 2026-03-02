import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useTranslation } from 'react-i18next';

import { Key, User, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AdminUser {
  username: string;
}

export default function SinglePasswordUpdate() {
  const { t } = useTranslation(['admin', 'translation']);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | null }>({
    message: '',
    type: null
  });

  useEffect(() => {
    const fetchUsers = async () => {
      setIsFetching(true);
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('username');

        if (error) throw error;
        
        if (data) {
          const mappedUsers = data.map((u: any) => ({
            username: u.username
          }));
          setUsers(mappedUsers);
        }
      } catch (error: any) {
        console.error('Error fetching users:', error);
        setStatus({ message: t('passwords.fetch_users_failed') + error.message, type: 'error' });
      } finally {
        setIsFetching(false);
      }
    };

    fetchUsers();
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ message: '', type: null });

    // 🔽 加入這兩行來檢查你的「身分證」狀態
    const { data: { session } } = await supabase.auth.getSession();
    console.log("目前的登入狀態：", session);

    if (!session) {
      setStatus({ message: t('passwords.not_logged_in'), type: 'error' });
      return;
    }

    if (!selectedUsername) {
      setStatus({ message: t('passwords.select_user'), type: 'error' });
      return;
    }

    if (!newPassword || !confirmPassword) {
      setStatus({ message: t('passwords.enter_password'), type: 'error' });
      return;
    }

    if (newPassword.length < 6) {
      setStatus({ message: t('passwords.password_length'), type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus({ message: t('passwords.password_mismatch'), type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      console.log('Invoking update-password for:', selectedUsername);
      const { data, error } = await supabase.functions.invoke('update-password', {
        body: {
          updates: [
            {
              username: selectedUsername,
              newPassword: newPassword
            }
          ]
        }
      });

// 🔽 請在 invoke 執行完之後，立刻加上這行 console.log
console.log("Edge Function 詳細回傳內容：", data);

      if (error) {
        console.error('Edge Function Error:', error);
        throw error;
      }

      // 🚨 回傳結果防呆處理
      const result = data.results[0];
      if (result.status === 'failed') {
        setStatus({ message: `❌ ${t('passwords.update_failed_reason')}${result.reason}`, type: 'error' });
        return;
      }

      setStatus({ message: t('passwords.update_success'), type: 'success' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Catch Error:', error);
      setStatus({ message: t('passwords.update_failed') + (error.message || t('passwords.unknown_error')), type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Key className="w-6 h-6 text-amber-600" />
        <h2 className="text-xl font-bold text-stone-800">{t('passwords.single_update')}</h2>
      </div>

      <form onSubmit={handleUpdatePassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">{t('passwords.select_user')}</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <select
              className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white appearance-none disabled:bg-stone-50"
              value={selectedUsername}
              onChange={(e) => setSelectedUsername(e.target.value)}
              disabled={isFetching || isLoading}
            >
              <option value="">-- {isFetching ? t('passwords.loading') : t('passwords.select_user')} --</option>
              {users.map((user) => (
                <option key={user.username} value={user.username}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedUsername && (
          <>
            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">{t('passwords.new_password')}</label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder={t('passwords.enter_new_password')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">{t('passwords.confirm_new_password')}</label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder={t('passwords.enter_new_password_again')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {status.message && (
              <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
              }`}>
                {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {status.message}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 bg-stone-800 text-white hover:bg-stone-700 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('passwords.updating')}
                </>
              ) : (
                t('passwords.confirm_update')
              )}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
