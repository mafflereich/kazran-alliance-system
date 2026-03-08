// src/components/MemberBoard/MemberCard/MemberScoreEditor.tsx
import { useRef, useEffect, useState } from 'react';
import type { Member } from '../types';
import { useMemberBoardStore } from '../store/useMemberBoardStore';

type Props = {
    member: Member;
};

export default function MemberScoreEditor({ member }: Props) {
    const { updateMember } = useMemberBoardStore();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(member.totalScore?.toString() || '0');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const handleSave = () => {
        if (!editing) return;
        setEditing(false);
        const num = value.trim() === '' ? 0 : parseFloat(value);
        if (!isNaN(num) && num !== member.totalScore) {
            updateMember(member.id!, { totalScore: num });
        } else if (isNaN(num)) {
            setValue(member.totalScore?.toString() || '0');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            setValue(member.totalScore?.toString() || '0');
            setEditing(false);
        }
    };

    return (
        <div className="min-w-[40px] text-right relative z-10">
            {editing ? (
                <input
                    ref={inputRef}
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className="
            w-16 text-[10px] bg-gray-800 border border-gray-600 rounded px-1 py-0.5 
            outline-none focus:border-emerald-500 text-emerald-300 text-right
          "
                    step="0.1"
                    min="0"
                />
            ) : (
                <div
                    className="text-[10px] font-medium cursor-pointer hover:text-emerald-300"
                    onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                >
                    {member.totalScore ?? 0}
                </div>
            )}
        </div>
    );
}