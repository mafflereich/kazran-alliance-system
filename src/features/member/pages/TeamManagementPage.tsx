import { MemberBoard } from '../components/MemberBoard';
import { useAppContext } from '@/store';
import { useEffect, useMemo } from 'react';

export default function TeamManagementPage() {
    // 假設你從 db 取得的資料
    const { db, fetchAllMembers } = useAppContext();

    useEffect(() => {
        fetchAllMembers();
        // fetchAllMembers 由 AppContext 提供，僅在頁面首次進入時載入
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 保留陣列 identity，避免 MemberBoard 每次父層 render 都重新 init
    const members = useMemo(() => Object.values(db.members), [db.members]);
    const guilds = useMemo(() => Object.values(db.guilds), [db.guilds]);

    return (
        <div className="bg-stone-100 dark:bg-stone-900 flex flex-col h-screen overflow-hidden">
            <main className="flex-1 mx-auto px-4 py-8 w-full h-full overflow-hidden">
                <MemberBoard initialMembers={members} initialGuilds={guilds} onSave={fetchAllMembers} />
            </main>
        </div>
    );
}