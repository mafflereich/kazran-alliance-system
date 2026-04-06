import { supabase } from './supabase';

/**
 * Reads is_debug_mode from settings row id=1 in Supabase.
 * Called only on error paths, so the extra round-trip is acceptable.
 */
export async function isDebugMode(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('is_debug_mode')
      .eq('id', 1)
      .single();
    if (error || !data) return false;
    return (data as any).is_debug_mode ?? false;
  } catch {
    return false;
  }
}
