import { lazy, Suspense } from 'react';
import { Routes, Route, useParams, Navigate } from 'react-router-dom';
import ProtectedRoute from '@shared/ui/ProtectedRoute';
import { useAppContext } from '@/store';

const Login = lazy(() => import('@features/auth/pages/Login'));
const GuildDashboard = lazy(() => import('@features/guild/pages/GuildDashboard'));
const AdminDashboard = lazy(() => import('@features/admin/pages/AdminDashboard'));
const TeamManagementPage = lazy(() => import('@features/member/pages/TeamManagementPage'));
const AllianceRaidRecord = lazy(() => import('@features/raid/pages/AllianceRaidRecord'));
const ApplicationMailbox = lazy(() => import('@features/mailbox/pages/ApplicationMailbox'));
const ArcadePage = lazy(() => import('@features/arcade/pages/Arcade'));
const Toolbox = lazy(() => import('@features/toolbox/pages/Toolbox'));

const GuildDashboardWrapper = () => {
    const { guildId } = useParams<{ guildId: string }>();
    return <GuildDashboard guildId={guildId || ''} />;
};

const LoginWrapper = () => {
    return <Login />;
};

export default function AppRoutes() {

    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center text-xl">載入中...</div>}>
            <Routes>
                <Route path="/" element={<LoginWrapper />} />
                <Route path="/guild/:guildId" element={
                    <ProtectedRoute>
                        <GuildDashboardWrapper />
                    </ProtectedRoute>
                } />
                <Route path="/admin" element={
                    <ProtectedRoute allowedRoles={['admin', 'creator', 'manager']}>
                        <AdminDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/team" element={
                    <ProtectedRoute>
                        <TeamManagementPage />
                    </ProtectedRoute>
                } />
                <Route path="/raid" element={
                    <ProtectedRoute>
                        <AllianceRaidRecord />
                    </ProtectedRoute>
                } />
                <Route path="/mailbox" element={
                    <ProtectedRoute>
                        <ApplicationMailbox />
                    </ProtectedRoute>
                } />
                <Route path="/arcade" element={
                    <ProtectedRoute>
                        <ArcadePage />
                    </ProtectedRoute>
                } />
                <Route path="/toolbox" element={
                    <ProtectedRoute>
                        <Toolbox />
                    </ProtectedRoute>
                } />
                {/* Fallback for unknown routes */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}
