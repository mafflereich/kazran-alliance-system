import React, { useState } from 'react';
import { Shield, AlertCircle, X, Mail, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@shared/api/supabase';

export function LoginModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleDiscordLogin = async () => {
        setLoading(true);
        setError('');

        try {
            const { error: authError } = await supabase.auth.signInWithOAuth({
                provider: 'discord',
                options: {
                    redirectTo: `${window.location.origin}${window.location.pathname}`,
                    scopes: 'guilds.members.read',
                },
            });

            if (authError) {
                throw new Error(authError.message);
            }
        } catch (error: any) {
            setError(error.message);
            console.error(t('header.login_failed'), error);
            setLoading(false);
        }
    };

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                throw new Error(authError.message);
            }
            onClose();
        } catch (error: any) {
            setError(error.message);
            console.error('Admin login failed:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm">
            <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                <div className="bg-stone-50 dark:bg-stone-700 px-6 py-4 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-stone-800 dark:text-stone-200">
                        <Shield className="w-6 h-6 text-amber-600" /> {t('header.login_btn')}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-stone-200 dark:hover:bg-stone-600 rounded-full transition-colors">
                        <X className="w-5 h-5 text-stone-500 dark:text-stone-400" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="space-y-4">
                        <p className="text-stone-600 dark:text-stone-400 text-sm text-center mb-6">
                            {t('header.discord_login_desc', '請使用 Discord 帳號登入系統')}
                        </p>

                        <button
                            onClick={handleDiscordLogin}
                            disabled={loading}
                            className="w-full py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                            </svg>
                            {loading && !showAdminLogin ? t('header.logging_in') : t('header.login_with_discord', '使用 Discord 登入')}
                        </button>

                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-stone-200 dark:border-stone-700"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-white dark:bg-stone-800 px-2 text-xs text-stone-500 dark:text-stone-400">
                                    {t('common.or', '或')}
                                </span>
                            </div>
                        </div>

                        {!showAdminLogin ? (
                            <button
                                onClick={() => setShowAdminLogin(true)}
                                className="w-full py-3 bg-stone-100 hover:bg-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-300 rounded-lg font-medium transition-colors flex items-center justify-center gap-3"
                            >
                                <Shield className="w-5 h-5" />
                                {t('header.admin_login', '管理員登入')}
                            </button>
                        ) : (
                            <form onSubmit={handleAdminLogin} className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder={t('header.admin_email', '管理員信箱')}
                                        required
                                        className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-stone-800 dark:text-stone-200"
                                    />
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={t('header.password', '密碼')}
                                        required
                                        className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-stone-800 dark:text-stone-200"
                                    />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowAdminLogin(false)}
                                        className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-300 rounded-lg font-medium transition-colors"
                                    >
                                        {t('common.cancel', '取消')}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                    >
                                        {loading ? t('header.logging_in', '登入中...') : t('header.login_btn', '登入')}
                                    </button>
                                </div>
                            </form>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 p-2 rounded border border-red-100 dark:border-red-800">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}