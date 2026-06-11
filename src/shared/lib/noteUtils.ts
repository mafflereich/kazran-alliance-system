export const PREV_GUILD_TAG = 'prev_guild';
const TAG_REGEX = /\[(\w+)\](.*?)\[\/\1\]/gs;

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
