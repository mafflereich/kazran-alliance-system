import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppContext } from '@/store';
import { usePermissions } from '@/shared/lib/usePermissions';
import { useCan } from '@/shared/lib/useCan';
import type { PermissionKey } from '@/shared/lib/permissions';
import UnauthorizedView from '@/shared/ui/UnauthorizedView';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** 舊介面：仍接受 pageId，內部走相容層（Phase 3 會移除） */
  allowedRoles?: string[];
  pageId?: string;
  /** 新介面：直接指定權限 key（Phase 2 起 routes.tsx 使用這個） */
  perm?: PermissionKey;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, pageId, perm }) => {
  const { currentUser, isRoleLoading } = useAppContext();
  const permissions = usePermissions();
  const { can } = useCan();
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

  // Check static allowedRoles if provided
  if (allowedRoles && (!permissions.userRole || !allowedRoles.includes(permissions.userRole))) {
    return <UnauthorizedView />;
  }

  // 新介面：權限 key（DB 的 role_grants）
  if (perm && !can(perm)) {
    return <UnauthorizedView />;
  }

  // 舊介面（相容層）：公會級頁面會走 canUserAccessGuildPage 的 fallback
  if (!perm && pageId && !permissions.canAccessPage(pageId)) {
    return <UnauthorizedView />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
