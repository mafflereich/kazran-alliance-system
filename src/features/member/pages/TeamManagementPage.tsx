import { MemberBoard } from '../components/MemberBoard';
import { useAppContext } from '@/store';
import { useEffect } from 'react';

export default function TeamManagementPage() {
    // 假設你從 db 取得的資料
    const { db, fetchAllMembers } = useAppContext();

    useEffect(() => {
        fetchAllMembers();
    }, []);

    const members = Object.values(db.members);
    const guilds = Object.values(db.guilds);

    return (
        <div className="max-h-[720px] bg-stone-100 dark:bg-stone-900 flex flex-col">
            <main className="flex-1 mx-auto px-4 py-8">
                <MemberBoard initialMembers={members} initialGuilds={guilds} onSave={fetchAllMembers} />
            </main>
        </div>
    );
}