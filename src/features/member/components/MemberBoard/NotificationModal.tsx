import { X, CheckCircle, AlertTriangle, Info, Copy } from 'lucide-react';
import { useMemberBoardStore } from './store/useMemberBoardStore';
import { useState } from 'react';

export default function NotificationModal() {
    const { notification, closeNotification } = useMemberBoardStore();
    const [copied, setCopied] = useState(false);

    if (!notification.isOpen) return null;

    const { title, message, type, copyContent, confirmLabel, onConfirm } = notification;

    const handleCopy = () => {
        if (copyContent) {
            navigator.clipboard.writeText(copyContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const getIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircle className="text-emerald-400" size={32} />;
            case 'error':
                return <AlertTriangle className="text-red-400" size={32} />;
            default:
                return <Info className="text-blue-400" size={32} />;
        }
    };

    const getBorderColor = () => {
        switch (type) {
            case 'success':
                return 'border-emerald-500/50';
            case 'error':
                return 'border-red-500/50';
            default:
                return 'border-blue-500/50';
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div 
                className={`bg-gray-900 border ${getBorderColor()} rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                    <div className="flex items-center gap-3">
                        {getIcon()}
                        <h3 className="text-lg font-bold text-gray-100">{title}</h3>
                    </div>
                    <button 
                        onClick={closeNotification}
                        className="text-gray-400 hover:text-gray-200 transition-colors rounded-full p-1 hover:bg-gray-800"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono bg-gray-950/50 p-4 rounded-lg border border-gray-800">
                        {message}
                    </pre>
                </div>

                <div className="px-6 py-4 bg-gray-900/50 border-t border-gray-800 flex justify-end gap-3">
                    {copyContent && (
                        <button
                            onClick={handleCopy}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-600 flex items-center gap-2"
                        >
                            {copied ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
                            {copied ? '已複製' : '複製訊息'}
                        </button>
                    )}
                    {confirmLabel && onConfirm && (
                        <button
                            onClick={() => {
                                onConfirm();
                                closeNotification();
                            }}
                            className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {confirmLabel}
                        </button>
                    )}
                    <button
                        onClick={closeNotification}
                        className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors border border-gray-700"
                    >
                        關閉
                    </button>
                </div>
            </div>
        </div>
    );
}
