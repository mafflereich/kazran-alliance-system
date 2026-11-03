export const PREV_GUILD_TAG = 'prev_guild';
export const CHECK_IN_TAG = 'checkin';
const TAG_REGEX = /\[(\w+)\](.*?)\[\/\1\]/gs;

/** 簽到記號：1~3 代表第 1~3 次簽到，4 代表「死」（永久失聯） */
export const CHECK_IN_ROUNDS = [1, 2, 3, 4] as const;
export type CheckInMark = (typeof CHECK_IN_ROUNDS)[number];

export function getNoteSegment(note: string | undefined, segment: string): string {
  if (!note) return '';
  const regex = new RegExp(`\\[${segment}\\](.*?)\\[/${segment}\\]`, 's');
  const match = note.match(regex);
  return match ? match[1] : '';
}

export function setNoteSegment(note: string | undefined, segment: string, value: string): string {
  const cleaned = removeNoteSegment(note, segment);
  if (!value) return cleaned;
  const newSegment = `[${segment}]${value}[/${segment}]`;
  return cleaned ? `${newSegment}\n${cleaned}` : newSegment;
}

export function removeNoteSegment(note: string | undefined, segment: string): string {
  if (!note) return '';
  const regex = new RegExp(`\\[${segment}\\].*?\\[/${segment}\\]\\n?`, 'gs');
  return note.replace(regex, '').trim();
}

export function getCustomNote(note: string | undefined): string {
  if (!note) return '';
  return note.replace(/\[\w+\].*?\[\/\w+\]\n?/gs, '').trim();
}

export function getPrevGuildName(note: string | undefined): string {
  return getNoteSegment(note, PREV_GUILD_TAG);
}

export function getAllSegments(note: string | undefined): Record<string, string> {
  if (!note) return {};
  const segments: Record<string, string> = {};
  let match;
  const regex = new RegExp(TAG_REGEX.source, 'gs');
  while ((match = regex.exec(note)) !== null) {
    segments[match[1]] = match[2];
  }
  segments['_custom'] = getCustomNote(note);
  return segments;
}

export function stripAllTags(note: string | undefined): string {
  if (!note) return '';
  return note.replace(/\[\w+\].*?\[\/\w+\]/gs, '').trim();
}

function normalizeCheckInMarks(marks: readonly number[]): CheckInMark[] {
  const valid = marks.filter((mark): mark is CheckInMark =>
    Number.isInteger(mark) && mark >= 1 && mark <= 4
  );
  return [...new Set(valid)].sort((a, b) => a - b);
}

/** 讀取成員身上的簽到記號（1~4）。 */
export function getCheckInMarks(note: string | undefined): CheckInMark[] {
  const raw = getNoteSegment(note, CHECK_IN_TAG);
  if (!raw) return [];
  return normalizeCheckInMarks(
    raw
      .split(/[,\s]+/)
      .map(value => Number(value))
      .filter(value => Number.isFinite(value))
  );
}

/** 寫入簽到記號；傳空陣列會移除整個簽到段落。 */
export function setCheckInMarks(note: string | undefined, marks: readonly number[]): string {
  return setNoteSegment(note, CHECK_IN_TAG, normalizeCheckInMarks(marks).join(','));
}

/** 切換單一簽到記號（點第二次會取消）。 */
export function toggleCheckInMark(note: string | undefined, mark: number): string {
  const marks = getCheckInMarks(note);
  const next = marks.includes(mark as CheckInMark)
    ? marks.filter(value => value !== mark)
    : [...marks, mark];
  return setCheckInMarks(note, next);
}

/** 清除簽到記號（保留成員備註與前公會標籤）。 */
export function clearCheckInMarks(note: string | undefined): string {
  return removeNoteSegment(note, CHECK_IN_TAG);
}

/** 是否已被標記為「死」（永久失聯）。 */
export function isCheckInDead(note: string | undefined): boolean {
  return getCheckInMarks(note).includes(4);
}
