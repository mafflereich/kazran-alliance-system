import React from 'react';

interface UnauthorizedViewProps {
  message?: string;
}

const UnauthorizedView: React.FC<UnauthorizedViewProps> = ({
  message = '您沒有訪問此頁面的權限。',
}) => (
  <div className="flex h-screen flex-col items-center justify-center bg-stone-900 text-white p-6 text-center">
    <h1 className="text-4xl font-bold text-red-500 mb-4">權限不足</h1>
    <p className="text-stone-400 mb-8">{message}</p>
    <button
      onClick={() => window.location.href = '#/'}
      className="px-6 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
    >
      返回首頁
    </button>
  </div>
);

export default UnauthorizedView;
