import { MemberBoard } from '../components/MemberBoard';
import { useAppContext } from '@/store';
import { useEffect, useMemo } from 'react';
import { usePermissions } from '@/shared/lib/usePermissions';
import UnauthorizedView from '@/shared/ui/UnauthorizedView';

export default function TeamManagementPage() {
    // 假設你從 db 取得的資料
    const { db, fetchAllMembers } = useAppContext();
    const { isGlobalAdmin } = usePermissions();

    useEffect(() => {
        if (!isGlobalAdmin) return;
        fetchAllMembers();
        // fetchAllMembers 由 AppContext 提供，僅在頁面首次進入時載入
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGlobalAdmin]);

    // 保留陣列 identity，避免 MemberBoard 每次父層 render 都重新 init
    const members = useMemo(() => Object.values(db.members), [db.members]);
    const guilds = useMemo(() => Object.values(db.guilds), [db.guilds]);

    // 第二道防線：即使路由設定被改動，也只有 creator / admin 能渲染看板
    if (!isGlobalAdmin) {
        return <UnauthorizedView message="Team Assign Board 僅限 creator / admin 使用。" />;
    }

    return (
        <div className="bg-stone-100 dark:bg-stone-900 flex flex-col h-screen overflow-hidden">
            <main className="flex-1 mx-auto px-4 py-8 w-full h-full overflow-hidden">
                <MemberBoard initialMembers={members} initialGuilds={guilds} onSave={fetchAllMembers} />
            </main>
        </div>
    );
}