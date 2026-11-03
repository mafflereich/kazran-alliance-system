import { lazy, Suspense } from 'react';
import { Routes, Route, useParams, Navigate } from 'react-router-dom';
import ProtectedRoute from '@shared/ui/ProtectedRoute';
import { useAppContext } from '@/store';

const Login = lazy(() => import('@features/auth/pages/Login'));
const GuildDashboard = lazy(() => import('@features/guild/pages/GuildDashboard'));
const MyCostumes = lazy(() => import('@features/guild/pages/MyCostumes'));
const AdminDashboard = lazy(() => import('@features/admin/pages/AdminDashboard'));
const TeamManagementPage = lazy(() => import('@features/member/pages/TeamManagementPage'));
const AllianceRaidRecord = lazy(() => import('@features/raid/pages/AllianceRaidRecord'));
const GuildRaidManager = lazy(() => import('@features/raid/pages/GuildRaidManager'));
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
        <Suspense fallback={<div className="flex h-screen items-center justify-center text-xl">頛銝?..</div>}>
            <Routes>
                <Route path="/" element={<LoginWrapper />} />
                <Route path="/guild/:guildId" element={
                    <ProtectedRoute perm="page.equipment.view">
                        <GuildDashboardWrapper />
                    </ProtectedRoute>
                } />
                <Route path="/costumes" element={
                    <ProtectedRoute perm="page.my_costumes.view">
                        <MyCostumes />
                    </ProtectedRoute>
                } />
                <Route path="/admin" element={
                    <ProtectedRoute perm="page.admin.view">
                        <AdminDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/team" element={
                    <ProtectedRoute perm="page.member_board.view">
                        <TeamManagementPage />
                    </ProtectedRoute>
                } />
                <Route path="/raid" element={
                    <ProtectedRoute perm="page.raid.view">
                        <AllianceRaidRecord />
                    </ProtectedRoute>
                } />
                <Route path="/raid-manager" element={
                    <ProtectedRoute perm="page.raid_manage.view">
                        <GuildRaidManager />
                    </ProtectedRoute>
                } />
                <Route path="/mailbox" element={
                    <ProtectedRoute perm="page.mailbox.view">
                        <ApplicationMailbox />
                    </ProtectedRoute>
                } />
                <Route path="/arcade" element={
                    <ProtectedRoute perm="page.arcade.view">
                        <ArcadePage />
                    </ProtectedRoute>
                } />
                <Route path="/toolbox" element={
                    <ProtectedRoute perm="page.toolbox.view">
                        <Toolbox />
                    </ProtectedRoute>
                } />
                {/* Fallback for unknown routes */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}

