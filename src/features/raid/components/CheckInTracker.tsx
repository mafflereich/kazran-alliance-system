import { Skull } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CHECK_IN_ROUNDS, getCheckInMarks } from '@/shared/lib/noteUtils';

interface CheckInTrackerProps {
  /** 成員完整備註（含 [checkin] 段落） */
  note: string | undefined;
  disabled?: boolean;
  /** 回傳切換後的記號陣列（1~4），由後端 RPC 負責寫入 */
  onChange?: (marks: number[]) => void;
}

const ROUND_BUTTON_BASE =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-[11px] font-bold leading-none transition-colors';
const ROUND_BUTTON_INACTIVE =
  'border-stone-300 bg-stone-100 text-stone-400 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-500';
const ROUND_BUTTON_ACTIVE =
  'border-emerald-400 bg-emerald-500 text-white shadow-sm dark:border-emerald-400 dark:bg-emerald-500';

export default function CheckInTracker({ note, disabled = false, onChange }: CheckInTrackerProps) {
  const { t } = useTranslation(['raid', 'translation']);
  const marks = getCheckInMarks(note);
  const isDead = marks.includes(4);

  const handleToggle = (mark: number) => {
    if (disabled || !onChange) return;
    const nextMarks = marks.includes(mark as any)
      ? marks.filter(value => value !== mark)
      : [...marks, mark];
    onChange(nextMarks.sort((a, b) => a - b));
  };

  return (
    <div className="flex items-center gap-0.5" title={t('raid.checkin_legend', '1-3 = 簽到回合，4 = 死（永久失聯）')}>
      {CHECK_IN_ROUNDS.map(mark => {
        const active = marks.includes(mark);
        const isDeadMark = mark === 4;
        const activeClass = isDeadMark
          ? 'border-red-500 bg-red-600 text-white shadow-sm dark:border-red-500 dark:bg-red-600'
          : ROUND_BUTTON_ACTIVE;
        const hoverClass = disabled || !onChange
          ? ''
          : active
            // 已選取的按鈕只提亮背景，不可改文字顏色（否則紅字壓紅底／綠字壓綠底會看不清楚）
            ? 'hover:brightness-110'
            : isDeadMark
              ? 'hover:border-red-400 hover:text-red-500'
              : 'hover:border-emerald-400 hover:text-emerald-600';

        return (
          <button
            key={mark}
            type="button"
            disabled={disabled || !onChange}
            onClick={() => handleToggle(mark)}
            title={isDeadMark
              ? t('raid.checkin_dead_title', '標記為死（永久失聯）')
              : t('raid.checkin_round_title', { round: mark, defaultValue: '第 {{round}} 次簽到' })}
            aria-pressed={active}
            className={`${ROUND_BUTTON_BASE} ${active ? activeClass : ROUND_BUTTON_INACTIVE} ${hoverClass} ${disabled || !onChange ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
          >
            {mark}
          </button>
        );
      })}
      {/* 骷髏頭的位置永遠保留（固定 14px），按下 4 才顯示圖示；
          否則圖示一出現就會把前面 4 顆按鈕擠扁（flex 預設會壓縮）。 */}
      <span className="ml-0.5 inline-flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden="true">
        {isDead && <Skull className="h-3 w-3 text-red-500" />}
      </span>
    </div>
  );
}
