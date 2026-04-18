import React, { useState } from 'react';
import { Copy, Check, AlertCircle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MemberMovePayload } from '@features/member/components/MemberBoard/store/types';
import type { GuildMoveSummary } from '../hooks/useMemberMoveAnnounce';

interface MemberMoveAnnounceTabProps {
  moveSummaries: GuildMoveSummary[];
  isLoading?: boolean;
}

const buildGroupText = (listName: string, members: GuildMoveSummary['members']) => {
  const membersText = members.map(member => {
    if (member.action === 'kick') {
      return `${member.name} (踢出)`;
    }
    return `${member.name} (${member.toGuild || member.fromGuild})`;
  }).join(' ');

  return `# ${listName}\n${membersText}\n請 {會長} {副會長} 今天送出他們`;
};

const MemberMoveAnnounceTab: React.FC<MemberMoveAnnounceTabProps> = ({ moveSummaries, isLoading = false }) => {
  const { t } = useTranslation(['raid', 'translation']);
  const [isPosting, setIsPosting] = useState(false);
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  const [fullMessage, setFullMessage] = useState('');
  const [showFullMessage, setShowFullMessage] = useState(false);

  // Build API payload
  const buildApiPayload = (): MemberMovePayload[] => {
    return moveSummaries.map(summary => {
      const actionLabel = summary.action === 'kick' ? '送出名單' : '招收名單';
      const listName = `${summary.guildName} - ${actionLabel}`;
      return {
        guildName: listName,
        members: summary.members.map(m => ({
          id: m.memberId,
          name: m.name,
          sourceGuild: m.fromGuild,
          targetGuild: m.toGuild,
          action: m.action
        }))
      };
    });
  };

  // Build Discord message preview
  const buildPreviewMessage = (): string => {
    if (moveSummaries.length === 0) return '(無成員變動)';

    const parts: string[] = [];
    moveSummaries.forEach(summary => {
      const actionLabel = summary.action === 'kick' ? '送出名單' : '招收名單';
      const listName = `${summary.guildName} - ${actionLabel}`;
      parts.push(buildGroupText(listName, summary.members));
    });
    return parts.join('\n\n');
  };

  const handleCopyPreview = (text: string) => {
    navigator.clipboard.writeText(text).catch(console.error);
    setCopyStates(prev => ({ ...prev, preview: true }));
    setTimeout(() => setCopyStates(prev => ({ ...prev, preview: false })), 2000);
  };

  const handlePostToApi = async () => {
    if (moveSummaries.length === 0) return;

    setIsPosting(true);
    try {
      const payload = buildApiPayload();
      const response = await fetch('https://chaosop.duckdns.org/api/memberMoveMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const message = await response.text();

      if (response.ok && message) {
        setFullMessage(message);
        setShowFullMessage(true);
        navigator.clipboard.writeText(message).catch(console.error);
      }
    } catch (error) {
      console.error('Failed to post to API:', error);
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading || moveSummaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-12 h-12 text-stone-300 mb-3" />
        <p className="text-stone-600 dark:text-stone-400">
          {isLoading ? '計算中...' : '目前無成員變動'}
        </p>
      </div>
    );
  }

  const previewMessage = buildPreviewMessage();

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-700">
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">踢出成員</div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {moveSummaries
              .filter(s => s.action === 'kick')
              .reduce((sum, s) => sum + s.members.length, 0)}
          </div>
        </div>
        <div>
          <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">招收成員</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {moveSummaries
              .filter(s => s.action === 'recruit')
              .reduce((sum, s) => sum + s.members.length, 0)}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <h4 className="font-bold text-stone-800 dark:text-stone-200">公告預覽</h4>
        <div className="p-4 bg-stone-100 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 text-sm font-mono text-stone-700 dark:text-stone-300 overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
          {previewMessage}
        </div>
        <button
          onClick={() => handleCopyPreview(previewMessage)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors text-sm font-medium"
        >
          {copyStates.preview ? (
            <>
              <Check className="w-4 h-4" />
              已複製
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              複製預覽訊息
            </>
          )}
        </button>
      </div>

      {/* API Post Button */}
      <div className="space-y-3">
        <h4 className="font-bold text-stone-800 dark:text-stone-200">生成完整公告</h4>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          將成員變動詳情發送至 API，獲取格式化的 Discord 公告訊息。
        </p>
        <button
          onClick={handlePostToApi}
          disabled={isPosting}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
        >
          {isPosting ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              生成中...
            </>
          ) : (
            '生成公告訊息'
          )}
        </button>
      </div>

      {/* Full Message Display */}
      {showFullMessage && fullMessage && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h5 className="font-bold text-green-800 dark:text-green-300 mb-2">生成成功</h5>
              <div className="text-sm font-mono text-green-700 dark:text-green-400 bg-white dark:bg-stone-900 p-3 rounded-lg overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                {fullMessage}
              </div>
              <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                ✓ 訊息已複製到剪貼簿
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Changes */}
      <div className="space-y-3">
        <h4 className="font-bold text-stone-800 dark:text-stone-200">詳細變動</h4>
        <div className="space-y-2">
          {moveSummaries.map((summary, idx) => (
            <div
              key={idx}
              className="p-3 bg-stone-50 dark:bg-stone-900/50 rounded-lg border border-stone-200 dark:border-stone-700"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-stone-800 dark:text-stone-200">{summary.guildName}</div>
                <div
                  className={`text-xs font-bold px-2 py-1 rounded-full ${summary.action === 'kick'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    }`}
                >
                  {summary.action === 'kick' ? '踢出' : '招收'}
                </div>
              </div>
              <div className="text-sm text-stone-600 dark:text-stone-400">
                {summary.members.map((m, i) => (
                  <div key={i}>
                    {m.name}
                    {m.action === 'kick' ? ' (踢出)' : ` (來自 ${m.fromGuild})`}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MemberMoveAnnounceTab;
