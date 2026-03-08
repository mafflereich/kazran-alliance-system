import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppContext } from '@/store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { currentUser, db, isRoleLoading } = useAppContext();
  const location = useLocation();

  if (isRoleLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-900 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-lg font-medium animate-pulse">驗證權限中...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    // Redirect to login but save the location they were trying to go to
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  const userRole = db.users[currentUser]?.role;

  if (allowedRoles && (!userRole || !allowedRoles.includes(userRole))) {
    // If user is logged in but doesn't have the right role, redirect to a safe place (like the first guild if available, or just a generic unauthorized page)
    // For now, let's redirect to the root or show an unauthorized message
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-stone-900 text-white p-6 text-center">
        <h1 className="text-4xl font-bold text-red-500 mb-4">權限不足</h1>
        <p className="text-stone-400 mb-8">您沒有訪問此頁面的權限。</p>
        <button 
          onClick={() => window.location.href = '#/'}
          className="px-6 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
        >
          返回首頁
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
