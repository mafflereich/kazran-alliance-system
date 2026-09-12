import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Database, Guild, Member, Costume, Role, User, Character, ArchivedMember, ArchiveHistory, Toast, ToastType, Setting, ApplyMail, AccessControl, Equipment, PlayPreferences, EquipmentVisibility, CostumeRecord, CategoryVisibility } from '@/entities/member/types';
import { supabase, supabaseInsert, supabaseKey, supabaseUpdate, supabaseUpsert, toCamel, toSnake, fetchAllPaginated } from '@/shared/api/supabase';
import { fetchMemberSecrets, applySecretsToMembers } from '@/shared/api/memberSecrets';
import { isDebugMode } from '@/shared/api/debugMode';
import { Logger } from '@/shared/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/shared/lib/utils';

const defaultData: Database = {
  guilds: {},
  guildOrder: [],
  members: {},
  characters: {},
  costumes: {},
  settings: {},
  applyMails: {},
  accessControl: {}
};

type ViewState = { type: 'admin' } |
{ type: 'guild', guildId: string } |
{ type: 'application_mailbox' } |
{ type: 'arcade' } |
{ type: 'alliance_raid_record' } |
{ type: 'toolbox' } |
{ type: 'member_board' } |
  null;

interface AppContextType {
  db: Database;
  setDb: React.Dispatch<React.SetStateAction<Database>>;
  currentView: ViewState;
  setCurrentView: React.Dispatch<React.SetStateAction<ViewState>>;
  currentUser: string | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<string | null>>;
  currentAvatar: string | null;
  userGuildRoles: string[];
  setuserGuildRoles: React.Dispatch<React.SetStateAction<string[]>>;
  userRole: User['role'] | null;
  userProfileId: string | null;

  // guild ids where the bound member is a leader/coleader (判斷公會管理員，不看 DC 身分組)
  managedGuildIds: string[];
  // 是否可管理某公會（creator/admin 或該公會正/副會長）
  canManageGuild: (guildId?: string | null) => boolean;

  loadDiscordRoles: () => Promise<void>;

  // Initial data loading
  fetchInitialData: () => Promise<void>;

  // Member functions
  fetchMembers: (guildId: string, columns?: string, force?: boolean) => Promise<boolean>;
  fetchAllMembers: (force?: boolean) => Promise<boolean>;
  loadMembersByIds: (ids: string[], force?: boolean) => Promise<boolean>;
  searchMembers: (query: string, includeArchived?: boolean, page?: number, pageSize?: number) => Promise<{ data: Member[], total: number }>;
  addMember: (guildId: string, name: string, role?: Role, note?: string) => Promise<void>;
  updateMember: (memberId: string, data: Partial<Member>) => Promise<void>;
  updateMembersNotes: (entries: { id: string; note: string }[]) => Promise<void>;
  deleteMember: (memberId: string) => Promise<void>;
  archiveMember: (memberId: string, fromGuildId: string, reason: string) => Promise<void>;
  unarchiveMember: (memberId: string, targetGuildId: string) => Promise<void>;
  updateMemberCostumeLevel: (memberId: string, costumeId: string, level: number) => Promise<void>;
  updateMemberExclusiveWeapon: (memberId: string, characterId: string, hasWeapon: boolean) => Promise<void>;
  updateMemberProfile: (memberId: string, data: { equipment?: Equipment; playPreferences?: PlayPreferences; equipmentNote?: string; equipmentVisibility?: EquipmentVisibility; categoryVisibility?: CategoryVisibility; refiningTraces?: number }) => Promise<void>;

  // Guild functions
  addGuild: (name: string) => Promise<string | null>;
  updateGuild: (guildId: string, data: Partial<Guild>) => Promise<void>;
  deleteGuild: (guildId: string) => Promise<void>;

  // Character functions
  addCharacter: (name: string, order: number, nameE?: string) => Promise<void>;
  updateCharacter: (characterId: string, data: Partial<Character>) => Promise<void>;
  deleteCharacter: (characterId: string) => Promise<void>;
  updateCharactersOrder: (newOrder: Character[]) => Promise<void>;

  // Costume functions
  addCostume: (characterId: string, name: string, order: number, nameE?: string) => Promise<void>;
  updateCostume: (costumeId: string, data: Partial<Costume>) => Promise<void>;
  deleteCostume: (costumeId: string) => Promise<void>;
  updateCostumesOrder: (newOrder: Costume[]) => Promise<void>;

  // Settings functions
  updateSetting: (id: string, updates: Partial<Setting>) => Promise<void>;
  fetchSettings: () => Promise<void>;

  // Apply mail functions
  fetchApplyMails: () => Promise<void>;
  addApplyMail: (subject: string, content: string) => Promise<void>;
  updateApplyMail: (id: string, data: Partial<ApplyMail>) => Promise<void>;
  deleteApplyMail: (id: string) => Promise<void>;

  // Access control functions
  updateAccessControl: (page: string, roles: AccessControl['roles']) => Promise<void>;

  // Data management
  restoreData: (data: Partial<Database>) => Promise<void>;

  // Toast management
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;

  // Music management
  userVolume: number | null;
  setUserVolume: (volume: number) => void;

  handleLogout: () => Promise<void>;

  isLoaded: boolean;
  isRoleLoading: boolean;
  isMembersLoading: boolean;
}

import { setUserId, logEvent } from '@/analytics';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();

  const [db, setDbState] = useState<Database>(defaultData);
  const [currentView, setCurrentViewState] = useState<ViewState>(() => {
    const saved = localStorage.getItem('currentView');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const setCurrentView = (view: React.SetStateAction<ViewState>) => {
    setCurrentViewState(prev => {
      const next = typeof view === 'function' ? (view as any)(prev) : view;
      if (next) {
        localStorage.setItem('currentView', JSON.stringify(next));
      } else {
        localStorage.removeItem('currentView');
      }
      return next;
    });
  };

  const [currentAvatar, setCurrentAvatarState] = useState<string | null>(null);
  const [currentUser, setCurrentUserState] = useState<string | null>(null);
  const currentUserRef = useRef<string | null>(null);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const [userGuildRoles, setuserGuildRolesState] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<User['role'] | null>(null);
  const [userProfileId, setUserProfileId] = useState<string | null>(null);

  // 依綁定 member 的正/副會長身分，計算可管理的公會 id（不使用 DC 身分組）
  const managedGuildIds = useMemo(() => {
    if (!userProfileId) return [];
    const memberIds = userProfileId.split(',').map(id => id.trim()).filter(Boolean);
    const guildIds = new Set<string>();
    memberIds.forEach(mid => {
      const member = db.members[mid];
      if (member && (member.role === 'leader' || member.role === 'coleader') && member.guildId) {
        guildIds.add(member.guildId);
      }
    });
    return [...guildIds];
  }, [db.members, userProfileId]);

  const canManageGuild = useCallback((guildId?: string | null) => {
    if (userRole === 'creator' || userRole === 'admin') return true;
    if (guildId) return managedGuildIds.includes(guildId);
    return managedGuildIds.length > 0;
  }, [userRole, managedGuildIds]);

  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);

  const handleLogout = async () => {
    logEvent('User', 'Logout', currentUser || 'unknown');
    Logger.info({ source: 'frontend_auth', action: 'logout', message: '使用者登出', details: { username: currentUser } });
    await supabase.auth.signOut();
    setCurrentUser(null);
    window.location.href = window.location.origin + window.location.pathname;
  };

  const setCurrentUser = (user: string | null) => {
    setCurrentUserState(user);
    setUserId(user);
    if (!user) {
      setuserGuildRolesState([]);
      setCurrentAvatarState(null);
      setUserRole(null);
      setUserProfileId(null);
    }
  };

  const setuserGuildRoles = (roles: string[]) => {
    setuserGuildRolesState(roles);
  };

  const applyProfileState = (profile: any, fallbackName: string, fallbackRole: User['role'] = 'member') => {
    setCurrentAvatarState(profile.avatar_url);
    setCurrentUser(profile.display_name || fallbackName);
    setUserRole(profile.user_role || fallbackRole);
    setuserGuildRolesState(profile.user_guilds ? profile.user_guilds.split(',').map((r: string) => r.trim()) : []);
    setUserProfileId(profile.id);
  };

  // 即時重新讀取目前使用者的 profile（供 Realtime 收到 profiles 更新時呼叫）
  const refreshProfile = async () => {
    if (!supabase) return;
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) return;

    const user = session.user;

    if (user.app_metadata?.provider !== 'discord') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, user_role, user_guilds, display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (!profile) return;
      applyProfileState(profile, user.email || 'Admin', 'admin');
      return;
    }

    const discordId = user.identities?.find((i: any) => i.provider === 'discord')?.id || user.user_metadata?.sub;
    if (!discordId) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, user_role, user_guilds, display_name, avatar_url')
      .eq('discord_id', discordId)
      .maybeSingle();

    if (!profile) return;
    applyProfileState(profile, user.user_metadata?.full_name || user.user_metadata?.name || 'User');
  };

  const loadDiscordRoles = async (forceSync: boolean = false) => {
    if (currentUserRef.current) return;
    if (!supabase) return;

    setIsRoleLoading(true);

    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.user) return;

      const user = session.user;

      if (user.app_metadata?.provider !== 'discord') {
        // Handle email/password admin login
        const { data: existingProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id, user_role, user_guilds, display_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        console.log('Admin Login Debug:', { userId: user.id, existingProfile, profileError });

        if (!profileError && existingProfile) {
          applyProfileState(existingProfile, user.email || 'Admin', 'admin');
        } else {
          // Fallback if no profile exists for the email user
          setCurrentUser(user.email || 'User');
          setUserRole('member');
          setUserProfileId(null);
        }
        return;
      }

      const discordId = user.identities?.find((i: any) => i.provider === 'discord')?.id || user.user_metadata?.sub;
      if (!discordId) return;

      const discordUsername = user.user_metadata?.full_name || user.user_metadata?.name;

      // 1. 先檢查資料庫有沒有這個人的 profile
      let { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, auth_id, user_role, user_guilds, display_name, avatar_url')
        .eq('discord_id', discordId)
        .maybeSingle();

      // 2. 如果沒有 profile，或 profile 存在但 auth_id 為 null（管理員手動建立、從未登入同步），觸發 Edge Function
      const shouldSync = forceSync || !existingProfile || !existingProfile.auth_id;

      if (shouldSync) {
        try {
          const { data, error: invokeError } = await supabase.functions.invoke('sync-discord-roles', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: {
              user_id: user.id,
              discord_id: discordId,
              username: discordUsername
            }
          });

          if (invokeError) {
            console.error('Edge function returned an error:', invokeError);
          } else {
            console.log('Edge function synced successfully:', data);
          }
        } catch (error) {
          console.error('Error invoking edge function:', error);
        }

        // 同步完後，重新抓取一次 profile
        const { data: syncedProfile } = await supabase
          .from('profiles')
          .select('id, user_role, user_guilds, display_name, avatar_url')
          .eq('discord_id', discordId)
          .maybeSingle();

        existingProfile = syncedProfile;
      }

      if (existingProfile) {
        applyProfileState(existingProfile, discordUsername || 'User');
      } else {
        // 如果同步後還是沒有 profile，代表他不在公會內，或是發生了其他錯誤
        console.warn('Unauthorized login attempt: User not in guild or profile missing.');

        // 寫入系統日誌
        Logger.warn({
          source: 'frontend_auth',
          action: 'unauthorized_login',
          message: '未授權的登入嘗試 (不在公會內)',
          user_id: user.id,
          discord_id: discordId,
          details: { username: discordUsername }
        });

        // 強制登出並清空狀態
        await supabase.auth.signOut();
        setCurrentUser(null);
        setUserRole(null);
        setuserGuildRolesState([]);
        setCurrentAvatarState(null);
        setUserProfileId(null);

        // 延遲一點點顯示 Toast，確保畫面已經準備好
        setTimeout(() => {
          showToast(t('not_in_guild'), 'error');
        }, 500);
      }
    } catch (error) {
      console.error('Error in loadDiscordRoles:', error);
    } finally {
      setIsRoleLoading(false);
    }
  };

  const [loadedStates, setLoadedStates] = useState({
    global: false,
    guilds: false,
    costumes: false,
    characters: false
  });

  const isLoaded = loadedStates.global && loadedStates.guilds && loadedStates.costumes && loadedStates.characters;

  const [isOffline, setIsOffline] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [userVolume, setUserVolumeState] = useState<number | null>(() => {
    const saved = localStorage.getItem('userVolume');
    return saved !== null ? Number(saved) : 0;
  });

  const setUserVolume = (volume: number) => {
    setUserVolumeState(volume);
    localStorage.setItem('userVolume', volume.toString());
  };

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 10000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const fetchInitialData = async () => {
    try {
      const [guildsRes, charactersRes, costumesRes, settingsRes, accessControlRes] = await Promise.all([
        supabase ? supabase.from('guilds').select('id, name, tier, order_num, serial, is_display, username') : { data: [], error: null },
        supabase ? supabase.from('characters').select('id, name, name_e, order_num, atk_type, attribute') : { data: [], error: null },
        supabase ? supabase.from('costumes').select('id, name, name_e, character_id, image_name, order_num, is_new') : { data: [], error: null },
        supabase ? supabase.from('settings').select('id, bgm_url, bgm_default_volume, index_message, index_percent_type, application_pending_count') : { data: [], error: null },
        supabase ? supabase.from('access_control').select('page, roles') : { data: [], error: null },
      ]);

      if (guildsRes.error) throw guildsRes.error;
      if (charactersRes.error) throw charactersRes.error;
      if (costumesRes.error) throw costumesRes.error;
      if (settingsRes.error) throw settingsRes.error;
      // access_control might not exist yet, handle gracefully
      const accessControlData = accessControlRes.error ? [] : accessControlRes.data;

      const guilds = (guildsRes.data as any[] || []).reduce((acc, guild) => ({ ...acc, [guild.id]: toCamel(guild) }), {});
      const characters = (charactersRes.data as any[] || []).reduce((acc, char) => ({ ...acc, [char.id]: toCamel(char) }), {});
      const costumes = (costumesRes.data as any[] || []).reduce((acc, costume) => ({ ...acc, [costume.id]: toCamel(costume) }), {});
      const settings = (settingsRes.data as any[] || []).reduce((acc, setting) => ({ ...acc, [setting.id]: toCamel(setting) }), {});
      const accessControl = (accessControlData as any[] || []).reduce((acc, ac) => {
        const camelAc = toCamel<AccessControl>(ac);
        return { ...acc, [camelAc.page]: camelAc };
      }, {});

      setDbState(prev => ({
        ...prev,
        guilds,
        characters,
        costumes,
        settings,
        accessControl,
      }));

      setLoadedStates({ global: true, guilds: true, costumes: true, characters: true });

    } catch (error) {
      console.error("Error fetching initial data:", error);
      setIsOffline(true);
      setLoadedStates({ global: true, guilds: true, costumes: true, characters: true });
    }
  };

  // Subscribe to global data (costumes, users) and guilds
  useEffect(() => {
    const initAuth = async () => {
      if (!supabase) {
        console.warn("Supabase is not initialized. Auth features disabled.");
        return;
      }
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("Auth session error:", error.message);
          // If there's an auth error (like invalid refresh token), clear local storage to stop retry loops
          if (error.message.toLowerCase().includes('refresh token') || error.message.toLowerCase().includes('refresh_token')) {
            await supabase.auth.signOut();
            setCurrentUser(null);
            setCurrentView(null);
          }
        } else if (!session && currentUserRef.current) {
          // No session but we have a local user, clear it to stay in sync
          setCurrentUser(null);
          setCurrentView(null);
        }
      } catch (err) {
        console.error("Error initializing auth:", err);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const token = session?.access_token;

      if (session?.user && token && token.split('.').length === 3) {
        // 當 Discord 用戶主動登入時，觸發 sync-discord-roles（註冊/更新流程）
        if (event === 'SIGNED_IN') {
          await loadDiscordRoles(true);
        } else if (event === 'INITIAL_SESSION') {
          // 重新整理網頁時，只從資料庫讀取，不呼叫 Edge Function
          await loadDiscordRoles(false);
        }
      } else {
        setCurrentUser(null);
        setCurrentView(null);
      }
    });

    fetchInitialData();

    // 訂閱 profiles 更新：當目前使用者的 profile（例如 user_guilds）被
    // sync_profile_guild_for_member trigger 更新時，即時刷新前端權限狀態，
    // 讓成員轉移公會後不需重新登入即可看到新公會。
    const profileChannel = supabase
      .channel('profiles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async (payload: any) => {
        if (!supabase) return;
        if (payload.eventType !== 'UPDATE') return;
        const changedDiscordId = (payload as any).new?.discord_id;
        if (!changedDiscordId) return;
        const { data: { session } } = await supabase.auth.getSession();
        const sessionDiscordId = session?.user?.identities?.find((i: any) => i.provider === 'discord')?.id || session?.user?.user_metadata?.sub;
        if (changedDiscordId === sessionDiscordId) {
          refreshProfile();
        }
      })
      .subscribe();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      supabase.removeChannel(profileChannel);
    };
  }, []);

  // Keep track of member subscription
  const [memberUnsub, setMemberUnsub] = useState<(() => void) | null>(null);



  // 登入/刷新時載入綁定成員，讓 managedGuildIds 能依正/副會長身分正確計算
  useEffect(() => {
    if (!userProfileId) return;
    const memberIds = userProfileId.split(',').map(id => id.trim()).filter(Boolean);
    if (memberIds.length === 0) return;
    const missing = memberIds.filter(mid => !db.members[mid]);
    if (missing.length > 0) {
      loadMembersByIds(memberIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfileId]);
  // Function to fetch members for a specific guild
  const fetchMembers = async (guildId: string, columns: string = 'id, name, guild_id, role, play_preferences, equipment_note, is_equipment_hidden, equipment_visibility, category_visibility, equipment_updated_at, costumes_updated_at, color, total_score, updated_at, status, member_notes(note, is_reserved, archive_remark), member_raid_records(id, season_id, score, season_note, overkill)', force: boolean = false): Promise<boolean> => {
    if (isOffline && !force) return false;
    if (force) setIsOffline(false);

    // Check if we already have members for this guild
    const hasCachedMembers = Object.values(db.members).some(m => m.guildId === guildId);

    // Only show loading if we don't have any data for this guild
    if (!hasCachedMembers) {
      setIsMembersLoading(true);
    }

    // First, get the max ID from raid_seasons
    const { data: seasonData, error: seasonError } = await supabase
      .from('raid_seasons')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    if (seasonError) {
      console.error("Error fetching raid seasons:", seasonError);
    }

    const maxSeasonId = seasonData?.[0]?.id || null;

    const selectQuery = columns;

    let data: any[];
    try {
      data = await fetchAllPaginated('members', selectQuery, q => q.eq('guild_id', guildId));
    } catch (error: any) {
      console.error("Error fetching members:", error);
      isDebugMode().then(enabled => {
        if (!enabled) return;
        supabase.auth.getSession().then(({ data: { session } }) => {
          console.error("=== DETAILED ERROR LOG FOR MEMBERS FETCH (fetchMembers) ===", JSON.stringify({
            errorDetails: error,
            errorMessage: error.message,
            errorCode: error.code,
            errorHint: error.hint,
            userSession: session?.user ? {
              id: session.user.id,
              email: session.user.email,
              role: session.user.role,
              app_metadata: session.user.app_metadata,
              user_metadata: session.user.user_metadata
            } : null,
            query: selectQuery,
            guildId: guildId
          }, null, 2));
        });
      });
      setIsOffline(true);
      showToast(t('common.fetch_members_failed'), 'error');
      setIsMembersLoading(false);
      return false;
    }

    const newMembers = data.reduce((acc, member) => {
      const camelMember = toCamel<any>(member);
      const memberNotes = Array.isArray(camelMember.memberNotes) ? camelMember.memberNotes[0] : camelMember.memberNotes;

      // Filter member_raid_records to only include records for the max season ID
      const allRaidRecords = Array.isArray(camelMember.memberRaidRecords) ? camelMember.memberRaidRecords : [];
      const filteredRaidRecords = maxSeasonId
        ? allRaidRecords.filter((r: any) => r.season_id === maxSeasonId)
        : [];
      const memberRaidRecords = filteredRaidRecords[0];

      // member_notes keys are in snake_case since toCamel uses { deep: false }
      const note = memberNotes?.note || '';
      const isReserved = memberNotes?.is_reserved || false;
      const archiveRemark = memberNotes?.archive_remark || '';
      const seasonNote = memberRaidRecords?.seasonNote || memberRaidRecords?.season_note || '';
      const overkill = memberRaidRecords?.overkill ?? null;
      const score = memberRaidRecords?.score ?? 0;
      const mappedMember: Member = {
        ...camelMember,
        note,
        isReserved,
        archiveRemark,
        seasonNote,
        overkill,
        score,
      };
      delete (mappedMember as any).memberNotes;
      delete (mappedMember as any).memberRaidRecords;
      return { ...acc, [mappedMember.id!]: mappedMember };
    }, {});

    const memberIds = Object.keys(newMembers);
    if (memberIds.length > 0) {
      const secrets = await fetchMemberSecrets(memberIds);
      const merged = applySecretsToMembers(Object.values(newMembers), secrets);
      merged.forEach((m) => { if (m.id) newMembers[m.id] = m; });
    }

    setDbState(prev => {
      // Filter out old members of this guild from the previous state
      // This ensures that if a member was deleted on the server, they are removed from local state
      const otherGuildMembers = Object.entries(prev.members)
        .filter(([_, m]) => m.guildId !== guildId)
        .reduce((acc, [id, m]) => ({ ...acc, [id]: m }), {});

      return {
        ...prev,
        members: { ...otherGuildMembers, ...newMembers }
      };
    });

    if (isOffline) setIsOffline(false);
    setIsMembersLoading(false);
    return true;
  };

  const fetchAllMembers = async (force: boolean = false): Promise<boolean> => {
    if (isOffline && !force) return false;
    if (force) setIsOffline(false);
    setIsMembersLoading(true);
    let success = true;

    try {
      // First, get the max ID from raid_seasons
      const { data: seasonData, error: seasonError } = await supabase
        .from('raid_seasons')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

      if (seasonError) {
        console.error("Error fetching raid seasons:", seasonError);
      }

      const maxSeasonId = seasonData?.[0]?.id || null;

      // Fetch raid records for the latest season in parallel with members
      const raidRecordsQuery = maxSeasonId
        ? supabase
          .from('member_raid_records')
          .select('member_id, score, season_note, overkill')
          .eq('season_id', maxSeasonId)
        : Promise.resolve({ data: [] as any[], error: null });

      // Fetch members with pagination to handle >1000 rows (PostgREST default limit)
      const PAGE_SIZE = 1000;
      let allMembersData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
          .from('members')
          .select('id, name, guild_id, role, play_preferences, equipment_note, is_equipment_hidden, equipment_visibility, category_visibility, equipment_updated_at, costumes_updated_at, color, total_score, updated_at, status, member_notes(note, is_reserved, archive_remark)')
          .range(offset, offset + PAGE_SIZE - 1);

        if (pageError) {
          console.error("Error fetching all members:", pageError);
          isDebugMode().then(enabled => {
            if (!enabled) return;
            supabase.auth.getSession().then(({ data: { session } }) => {
              console.error("=== DETAILED ERROR LOG FOR MEMBERS FETCH (fetchAllMembers) ===", JSON.stringify({
                errorDetails: pageError,
                errorMessage: pageError.message,
                errorCode: (pageError as any).code,
                errorDetails2: (pageError as any).details,
                errorHint: (pageError as any).hint,
                userSession: session?.user ? {
                  id: session.user.id,
                  email: session.user.email,
                  role: session.user.role,
                  app_metadata: session.user.app_metadata,
                  user_metadata: session.user.user_metadata
                } : null,
                query: "select('id, name, guild_id, role, play_preferences, equipment_note, is_equipment_hidden, equipment_visibility, category_visibility, equipment_updated_at, costumes_updated_at, color, total_score, updated_at, status, member_notes(note, is_reserved, archive_remark)')"
              }, null, 2));
            });
          });
          success = false;
          break;
        }

        if (!pageData || pageData.length === 0) {
          hasMore = false;
        } else {
          allMembersData = allMembersData.concat(pageData);
          offset += PAGE_SIZE;
          if (pageData.length < PAGE_SIZE) {
            hasMore = false;
          }
        }
      }

      const [{ data: raidRecordsData }] = await Promise.all([raidRecordsQuery]);

      // Always apply whatever pages we managed to fetch so a partial failure doesn't wipe existing data
      if (success || allMembersData.length > 0) {
        const raidRecordsByMemberId = (raidRecordsData || []).reduce((acc, record) => ({ ...acc, [record.member_id]: record }), {});

        const allMembers: Record<string, Member> = allMembersData.reduce((acc, member) => {
          const camelMember = toCamel<any>(member);
          const memberNotes = Array.isArray(camelMember.memberNotes) ? camelMember.memberNotes[0] : camelMember.memberNotes;

          const memberRaidRecord = raidRecordsByMemberId[camelMember.id];
          // member_notes keys are in snake_case since toCamel uses { deep: false }
          const note = memberNotes?.note || '';
          const isReserved = memberNotes?.is_reserved || false;
          const archiveRemark = memberNotes?.archive_remark || '';
          const seasonNote = memberRaidRecord?.season_note || '';
          const overkill = memberRaidRecord?.overkill ?? null;
          const score = memberRaidRecord?.score ?? 0;
          const mappedMember: Member = {
            ...camelMember,
            note,
            isReserved,
            archiveRemark,
            seasonNote,
            overkill,
            score,
          };
          delete (mappedMember as any).memberNotes;
          delete (mappedMember as any).memberRaidRecords;
          return { ...acc, [mappedMember.id!]: mappedMember };
        }, {});
        const allMemberIds = Object.keys(allMembers);
        if (allMemberIds.length > 0) {
          // MemberBoard 只顯示 score / overkill / seasonNote（來自 member_raid_records），
          // 不需要 equipment 等敏感資料；不在此呼叫 fetchMemberSecrets（會把全部成員
          // 丟進 get_member_equipment RPC，導致 timeout / HTTP 500）。
        }
        setDbState(prev => ({ ...prev, members: allMembers }));
      }

      if (success) {
        if (isOffline) setIsOffline(false);
      } else {
        setIsOffline(true);
        showToast(t('common.fetch_failed'), 'error');
      }
      setIsMembersLoading(false);
      return success;
    } catch (error) {
      console.error("Error fetching all members:", error);
      setIsOffline(true);
      showToast(t('common.fetch_failed'), 'error');
      setIsMembersLoading(false);
      return false;
    }
  };

  // 依成員 id 撈取並合併寫入 db.members（不覆蓋其他公會），供「我的服裝」等情境載入自己成員
  const loadMembersByIds = async (ids: string[], force: boolean = false): Promise<boolean> => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return true;
    if (isOffline && !force) return false;
    if (force) setIsOffline(false);

    try {
      setIsMembersLoading(true);
      const selectQuery = 'id, name, guild_id, role, play_preferences, equipment_note, is_equipment_hidden, equipment_visibility, category_visibility, equipment_updated_at, costumes_updated_at, color, total_score, updated_at, status';
      const data = await fetchAllPaginated<Member>('members', selectQuery, q => q.in('id', uniqueIds));

      const newMembers: Record<string, Member> = data.reduce((acc, m) => ({ ...acc, [m.id!]: toCamel<Member>(m) }), {});

      const secrets = await fetchMemberSecrets(Object.keys(newMembers));
      const merged = applySecretsToMembers(Object.values(newMembers), secrets);
      merged.forEach((m) => { if (m.id) newMembers[m.id] = m; });

      setDbState(prev => ({ ...prev, members: { ...prev.members, ...newMembers } }));

      if (isOffline) setIsOffline(false);
      setIsMembersLoading(false);
      return true;
    } catch (error) {
      console.error("Error loading members by ids:", error);
      setIsOffline(true);
      setIsMembersLoading(false);
      return false;
    }
  };

  const searchMembers = async (query: string, includeArchived: boolean = false, page: number = 1, pageSize: number = 20): Promise<{ data: Member[], total: number }> => {
    if (!query.trim()) return { data: [], total: 0 };

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let queryBuilder = supabase
      .from('members')
      .select('id, name, guild_id, role, play_preferences, equipment_note, is_equipment_hidden, equipment_visibility, category_visibility, equipment_updated_at, costumes_updated_at, color, total_score, updated_at, status, member_notes(note, is_reserved, archive_remark), member_raid_records(score, season_note, overkill)', { count: 'exact' })
      .ilike('name', `%${query}%`)
      .order('status', { ascending: true }) // active comes before archived
      .order('name', { ascending: true })
      .range(from, to);

    if (!includeArchived) {
      queryBuilder = queryBuilder.eq('status', 'active');
    }

    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error("Error searching members:", error);
      isDebugMode().then(enabled => {
        if (!enabled) return;
        supabase.auth.getSession().then(({ data: { session } }) => {
          console.error("=== DETAILED ERROR LOG FOR MEMBERS FETCH (searchMembers) ===", JSON.stringify({
            errorDetails: error,
            errorMessage: error.message,
            errorCode: (error as any).code,
            errorDetails2: (error as any).details,
            errorHint: (error as any).hint,
            userSession: session?.user ? {
              id: session.user.id,
              email: session.user.email,
              role: session.user.role,
              app_metadata: session.user.app_metadata,
              user_metadata: session.user.user_metadata
            } : null,
            query: "select('id, name, guild_id, role, play_preferences, equipment_note, is_equipment_hidden, equipment_visibility, category_visibility, equipment_updated_at, costumes_updated_at, color, total_score, updated_at, status, member_notes(note, is_reserved, archive_remark), member_raid_records(score, season_note)')",
            searchQuery: query
          }, null, 2));
        });
      });
      return { data: [], total: 0 };
    }

    const mappedResults = (data as any[]).map(m => {
      const camelMember = toCamel<any>(m);
      const memberNotes = Array.isArray(camelMember.memberNotes) ? camelMember.memberNotes[0] : camelMember.memberNotes;
      const memberRaidRecords = Array.isArray(camelMember.memberRaidRecords) ? camelMember.memberRaidRecords[0] : camelMember.memberRaidRecords;
      // member_notes keys are in snake_case since toCamel uses { deep: false }
      const note = memberNotes?.note || '';
      const isReserved = memberNotes?.is_reserved || false;
      const archiveRemark = memberNotes?.archive_remark || '';
      const seasonNote = memberRaidRecords?.seasonNote || memberRaidRecords?.season_note || '';
      const overkill = memberRaidRecords?.overkill ?? null;
      const score = memberRaidRecords?.score ?? m.score ?? 0;
      const mappedMember: Member = {
        ...camelMember,
        note,
        isReserved,
        archiveRemark,
        seasonNote,
        overkill,
        score,
      };
      delete (mappedMember as any).memberNotes;
      delete (mappedMember as any).memberRaidRecords;
      return mappedMember;
    });

    const searchIds = mappedResults.map(m => m.id).filter((id): id is string => !!id);
    const secrets = await fetchMemberSecrets(searchIds);
    const memberData = applySecretsToMembers(mappedResults, secrets);

    return {
      data: memberData,
      total: count || 0
    };
  };

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (memberUnsub) memberUnsub();
    };
  }, [memberUnsub]);

  // Auto-fetch when entering guild view
  useEffect(() => {
    if (currentView?.type === 'guild' && currentView.guildId) {
      fetchMembers(currentView.guildId);
    } else if (currentView?.type === 'admin') {
      // In admin view, we might not want to clear immediately if we are going to select a guild
      // But for now, let's clear to be safe, or let GuildMembersManager fetch
      setDbState(prev => ({ ...prev, members: {} }));
      if (memberUnsub) {
        memberUnsub();
        setMemberUnsub(null);
      }
    }
  }, [currentView?.type, (currentView as any)?.guildId]);

  // Helper to update local state (deprecated, but kept for compatibility)
  // This function is now primarily for local state updates and might be simplified or removed.
  const setDb = (value: React.SetStateAction<Database>) => {
    setDbState(value);
  };

  const updateAccessControl = async (page: string, roles: AccessControl['roles']) => {
    const existing = db.accessControl[page];
    let error;

    if (existing) {
      const res = await supabaseUpdate('access_control', { roles }, { page });
      error = res.error;
    } else {
      const res = await supabaseInsert('access_control', { page, roles });
      error = res.error;
    }

    if (error) {
      console.error('Error updating access control:', error);
      Logger.error({ source: 'access_control', action: 'update_access_control', message: '更新頁面存取權限失敗', details: { page, roles, error: error.message } });
      showToast(t('common.update_failed'), 'error');
    } else {
      setDbState(prev => ({
        ...prev,
        accessControl: {
          ...prev.accessControl,
          [page]: { page, roles }
        }
      }));
      Logger.info({ source: 'access_control', action: 'update_access_control', message: '更新頁面存取權限', details: { page, roles } });
      showToast(t('common.update_success'), 'success');
    }
  };

  const addMember = async (guildId: string, name: string, role: Role = 'member', note: string = '', isReserved: boolean = false) => {
    // Check if member already exists in active status
    const { data: activeData, error: activeError } = await supabase
      .from('members')
      .select('id, name')
      .eq('name', name)
      .eq('status', 'active')
      .maybeSingle();

    if (activeError) {
      console.error('Error checking active member:', activeError);
    }

    if (activeData) {
      showToast(t('common.member_exists', { name }), 'warning');
      return;
    }

    // Check if member exists in archived status
    const { data: archivedData, error: archivedError } = await supabase
      .from('members')
      .select('id, name')
      .eq('name', name)
      .eq('status', 'archived')
      .maybeSingle();

    if (archivedError) {
      console.error('Error checking archived member:', archivedError);
    }

    if (archivedData) {
      // If archived, unarchive them to the target guild
      await unarchiveMember(archivedData.id, guildId);
      if (note) {
        await updateMember(archivedData.id, { note });
      }
      return;
    }

    const newMemberId = uuidv4();
    const newMember = {
      id: newMemberId,
      name,
      guildId,
      role,
      records: {},
      updatedAt: Date.now()
    };

    // 不做 RETURNING：members 的敏感欄位未授權給 anon/authenticated 做 SELECT，
    // INSERT 搭配 RETURNING * 會因需讀取敏感欄位而回傳 permission denied。
    const { error } = await supabase
      .from('members')
      .insert(toSnake(newMember));

    if (error) {
      console.error('Error adding member:', error);
      Logger.error({ source: 'member_management', action: 'add_member', message: '新增成員失敗', details: { guildId, name, role, note, error: error.message } });
      return;
    }

    if (note || isReserved) {
      await supabase
        .from('member_notes')
        .upsert({ member_id: newMemberId, note, is_reserved: isReserved }, { onConflict: 'member_id' });
    }

    const addedMember = { ...newMember, note };
    Logger.info({ source: 'member_management', action: 'add_member', message: '新增成員', details: { memberId: newMemberId, guildId, name, role, note, isReserved } });
    setDbState(prev => ({
      ...prev,
      members: { ...prev.members, [addedMember.id]: addedMember }
    }));
  };

  const updateMemberCostumeLevel = async (memberId: string, costumeId: string, level: number) => {
    const currentRecords = db.members[memberId]?.records || {};
    const now = Date.now();
    const updatedRecords = {
      ...currentRecords,
      [costumeId]: { ...(currentRecords[costumeId] || {}), level, updatedAt: now }
    };

    const { error } = await supabase
      .from('members')
      .update({
        records: toSnake(updatedRecords),
        updated_at: now,
        costumes_updated_at: now
      })
      .eq('id', memberId);

    if (error) {
      console.error('Error updating member costume level:', error);
      Logger.error({ source: 'member_management', action: 'update_member_costume_level', message: '更新成員服裝等級失敗', details: { memberId, costumeId, level, error: error.message } });
    } else {
      Logger.info({ source: 'member_management', action: 'update_member_costume_level', message: '更新成員服裝等級', details: { memberId, costumeId, level } });
      setDbState(prev => ({
        ...prev,
        members: {
          ...prev.members,
          [memberId]: { ...prev.members[memberId], records: updatedRecords, updatedAt: now, costumesUpdatedAt: now }
        }
      }));
    }
  };

  const updateMember = async (memberId: string, data: Partial<Member>) => {
    const now = Date.now();
    const { note, isReserved, ...memberData } = data;

    // 不做 RETURNING（不回傳整列）：members 的部分敏感欄位（records /
    // exclusive_weapons / equipment…）未授權給 anon/authenticated 做 SELECT，
    // 若 UPDATE 搭配 RETURNING * 會因需讀取未授權欄位而回傳
    // 「permission denied for table members」。此函式亦不依賴回傳值。
    const { error } = await supabase
      .from('members')
      .update({ ...toSnake(memberData), updated_at: now })
      .eq('id', memberId);

    // Upsert member_notes fields if any changed. onConflict on member_id makes this
    // atomic and prevents duplicate rows (relies on UNIQUE(member_id) constraint).
    const hasMemberNotesUpdate = note !== undefined || isReserved !== undefined;

    if (hasMemberNotesUpdate) {
      const noteData: Record<string, any> = { member_id: memberId };
      if (note !== undefined) noteData.note = note;
      if (isReserved !== undefined) noteData.is_reserved = isReserved;

      const { error: upsertNoteError } = await supabase
        .from('member_notes')
        .upsert(noteData, { onConflict: 'member_id' });
      if (upsertNoteError) console.error('Error upserting member_notes:', upsertNoteError);
    }

    if (error) {
      console.error('Error updating member:', error);
      Logger.error({ source: 'member_management', action: 'update_member', message: '更新成員資料失敗', details: { memberId, data, error: error.message } });
    } else {
      Logger.info({ source: 'member_management', action: 'update_member', message: '更新成員資料', details: { memberId, data } });
      setDbState(prev => ({
        ...prev,
        members: { ...prev.members, [memberId]: { ...prev.members[memberId], ...data, updatedAt: now } }
      }));
    }
  };

  const updateMembersNotes = async (entries: { id: string; note: string }[]) => {
    if (entries.length === 0) return;
    const now = Date.now();

    const rows = entries.map(({ id, note }) => ({ member_id: id, note }));
    // 單一批次寫入 member_notes，避免逐人 request/log。
    const { error } = await supabase
      .from('member_notes')
      .upsert(rows, { onConflict: 'member_id' });

    if (error) {
      console.error('Error updating member notes:', error);
      Logger.error({ source: 'member_management', action: 'update_members_notes', message: '批次更新成員備註失敗', details: { count: entries.length, error: error.message } });
      return;
    }

    Logger.info({ source: 'member_management', action: 'update_members_notes', message: '批次更新成員備註', details: { count: entries.length } });

    setDbState(prev => {
      const members = { ...prev.members };
      entries.forEach(({ id, note }) => {
        members[id] = { ...members[id], note, updatedAt: now };
      });
      return { ...prev, members };
    });
  };

  const addGuild = async (name: string) => {
    const username = name.toLowerCase();
    const newGuild = { id: uuidv4(), name, tier: 1, orderNum: 99, username };
    const { data, error } = await supabaseInsert('guilds', newGuild);
    if (error) {
      console.error('Error adding guild:', error);
      Logger.error({ source: 'guild_management', action: 'add_guild', message: '新增公會失敗', details: { name, error: error.message } });
      return null;
    } else if (data) {
      const addedGuild = data[0] as Guild;
      Logger.info({ source: 'guild_management', action: 'add_guild', message: '新增公會', details: { guildId: addedGuild.id, name } });
      setDbState(prev => ({ ...prev, guilds: { ...prev.guilds, [addedGuild.id!]: addedGuild } }));
      return addedGuild.id;
    }
    return null;
  };

  const updateGuild = async (guildId: string, data: Partial<Guild>) => {
    const updateData = { ...data };
    if (updateData.name) {
      updateData.username = updateData.name.toLowerCase();
    }
    const { error } = await supabaseUpdate('guilds', updateData, { id: guildId });
    if (error) {
      console.error('Error updating guild:', error);
      Logger.error({ source: 'guild_management', action: 'update_guild', message: '更新公會失敗', details: { guildId, data: updateData, error: error.message } });
    } else {
      Logger.info({ source: 'guild_management', action: 'update_guild', message: '更新公會', details: { guildId, data: updateData } });
      setDbState(prev => ({ ...prev, guilds: { ...prev.guilds, [guildId]: { ...prev.guilds[guildId], ...updateData } } }));
    }
  };

  const deleteGuild = async (guildId: string) => {
    const { error } = await supabase.from('guilds').delete().eq('id', guildId);
    if (error) {
      console.error('Error deleting guild:', error);
      Logger.error({ source: 'guild_management', action: 'delete_guild', message: '刪除公會失敗', details: { guildId, error: error.message } });
    } else {
      Logger.warn({ source: 'guild_management', action: 'delete_guild', message: '刪除公會', details: { guildId, name: db.guilds[guildId]?.name } });
      setDbState(prev => {
        const { [guildId]: _, ...rest } = prev.guilds;
        return { ...prev, guilds: rest };
      });
    }
  };

  const deleteMember = async (memberId: string) => {
    const { error } = await supabase.from('members').delete().eq('id', memberId);
    if (error) {
      console.error('Error deleting member:', error);
      Logger.error({ source: 'member_management', action: 'delete_member', message: '刪除成員失敗', details: { memberId, error: error.message } });
    } else {
      Logger.warn({ source: 'member_management', action: 'delete_member', message: '刪除成員', details: { memberId, name: db.members[memberId]?.name } });
      setDbState(prev => {
        const { [memberId]: _, ...rest } = prev.members;
        return { ...prev, members: rest };
      });
    }
  };

  const archiveMember = async (memberId: string, fromGuildId: string, reason: string) => {
    if (isOffline) {
      showToast(t('common.offline_warning'), 'warning');
      return;
    }

    // Step 1: Insert history
    const { error: historyError } = await supabase
      .from('members_archive_history')
      .insert({
        member_id: memberId,
        from_guild_id: fromGuildId,
        archive_reason: reason
      });

    if (historyError) throw historyError;

    // Step 2: Update member status
    const { error: memberError } = await supabase
      .from('members')
      .update({ status: 'archived', guild_id: null })
      .eq('id', memberId);

    if (memberError) throw memberError;

    // Update local state: Remove member from the current list
    setDbState(prev => {
      const newMembers = { ...prev.members };
      delete newMembers[memberId];
      return { ...prev, members: newMembers };
    });

    Logger.warn({ source: 'member_management', action: 'archive_member', message: '封存成員', details: { memberId, fromGuildId, reason, name: db.members[memberId]?.name } });
  };

  const unarchiveMember = async (memberId: string, targetGuildId: string) => {
    if (isOffline) {
      showToast(t('common.offline_warning'), 'warning');
      return;
    }

    const { data: archivedData, error: fetchError } = await supabase
      .from('members')
      .select(`
          id,
          status,
          member_notes(archive_remark),
          members_archive_history (
            id,
            member_id,
            from_guild_id,
            archive_reason,
            archived_at,
            guilds (
              name
            )
          )
        `)
      .eq('id', memberId)
      .single();

    if (fetchError || !archivedData) {
      console.error('Error fetching archived member details:', fetchError);
      return;
    }

    const archivedMember = toCamel(archivedData) as ArchivedMember;
    const historyArray = archivedMember.membersArchiveHistory ? toCamel(archivedMember.membersArchiveHistory) as ArchiveHistory[] : [];

    // Sort by archived_at descending to get the latest
    historyArray.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());

    const latestHistory = historyArray[0];
    const archivedAt = latestHistory ? formatDate(latestHistory.archivedAt) : t('common.unknown_time');
    const archiveCount = historyArray.length;
    const remark = t('common.archive_remark', { time: archivedAt, count: archiveCount });

    // 不做 RETURNING：members 的敏感欄位（equipment / records / ...）未授權
    // 給 anon/authenticated 做 SELECT，若 UPDATE 搭配 RETURNING * 會因需讀取
    // 所有欄位（含敏感）而回傳「permission denied for table members」。
    const { error: updateError } = await supabase
      .from('members')
      .update({
        status: 'active',
        guild_id: targetGuildId
      })
      .eq('id', memberId);

    if (updateError) throw updateError;

    Logger.info({ source: 'member_management', action: 'unarchive_member', message: '解除封存成員', details: { memberId, targetGuildId, name: archivedMember.name } });

    const { error: upsertNoteError } = await supabase
      .from('member_notes')
      .upsert({ member_id: memberId, archive_remark: remark }, { onConflict: 'member_id' });
    if (upsertNoteError) console.error('Error upserting archive_remark:', upsertNoteError);

    // Update local state if needed (optional, depends on if we want to immediately show them in the guild)
    // Usually fetchMembers will handle this when the view changes, but for addMember flow it's good to have.
    setDbState(prev => {
      const updatedMembers = { ...prev.members };
      // If the member was already in our local state (unlikely if they were archived, unless we fetched all)
      if (updatedMembers[memberId]) {
        updatedMembers[memberId] = {
          ...updatedMembers[memberId],
          status: 'active',
          guildId: targetGuildId,
          archiveRemark: remark
        };
      }
      return { ...prev, members: updatedMembers };
    });
  };

  const updateMemberExclusiveWeapon = async (memberId: string, characterId: string, hasWeapon: boolean) => {
    const currentWeapons = db.members[memberId]?.exclusiveWeapons || {};
    const updatedWeapons = {
      ...currentWeapons,
      [characterId]: hasWeapon
    };

    const now = Date.now();
    const { error } = await supabase
      .from('members')
      .update({
        exclusive_weapons: toSnake(updatedWeapons),
        updated_at: now,
        costumes_updated_at: now
      })
      .eq('id', memberId);

    if (error) {
      console.error('Error updating exclusive weapon:', error);
      Logger.error({ source: 'member_management', action: 'update_member_exclusive_weapon', message: '更新成員專武失敗', details: { memberId, characterId, hasWeapon, error: error.message } });
    } else {
      Logger.info({ source: 'member_management', action: 'update_member_exclusive_weapon', message: '更新成員專武', details: { memberId, characterId, hasWeapon } });
      setDbState(prev => ({
        ...prev,
        members: {
          ...prev.members,
          [memberId]: { ...prev.members[memberId], exclusiveWeapons: updatedWeapons, updatedAt: now, costumesUpdatedAt: now }
        }
      }));
    }
  };

  const updateMemberProfile = async (
    memberId: string,
    data: {
      equipment?: Equipment;
      playPreferences?: PlayPreferences;
      equipmentNote?: string;
      equipmentVisibility?: EquipmentVisibility;
      categoryVisibility?: CategoryVisibility;
      refiningTraces?: number;
    }
  ) => {
    const now = Date.now();
    const payload: Record<string, any> = toSnake({ ...data, updatedAt: now });

    // 依變更的欄位記下對應的更新日期
    if (data.equipment !== undefined) {
      payload.equipment_updated_at = now;
    }
    // 服裝/專武更新日期由 updateMemberCostumeLevel/ExclusiveWeapon 負責；
    // 這裡不覆蓋（保留較精確的每服裝時間）。

    // 注意：updateMemberProfile 會寫入敏感欄位（equipment / refining_traces），
    // 這些欄位刻意未授權給 anon/authenticated 做 SELECT（只能走
    // get_member_equipment RPC 讀取）。因此這裡不做 RETURNING（不回傳整列），
    // 避免 PostgREST 因需要讀取未授權欄位而回傳「permission denied for table
    // members」。僅依 error 判斷成功與否。
    const { error } = await supabase
      .from('members')
      .update(payload)
      .eq('id', memberId);

    if (error) {
      console.error('Error updating member profile:', error);
      Logger.error({ source: 'member_management', action: 'update_member_profile', message: '更新成員個人資料失敗', details: { memberId, data, error: error.message } });
      showToast(t('common.save_failed'), 'error');
      return;
    }
    Logger.info({ source: 'member_management', action: 'update_member_profile', message: '更新成員個人資料', details: { memberId, data } });
    setDbState(prev => ({
      ...prev,
      members: { ...prev.members, [memberId]: { ...prev.members[memberId], ...data, updatedAt: now, equipmentUpdatedAt: data.equipment !== undefined ? now : prev.members[memberId]?.equipmentUpdatedAt } }
    }));
  };

  const addCharacter = async (name: string, order: number, nameE: string = '') => {
    const newChar = { id: uuidv4(), name, nameE, orderNum: order };
    const { data, error } = await supabaseInsert('characters', newChar);
    if (error) {
      console.error('Error adding character:', error);
      Logger.error({ source: 'character_management', action: 'add_character', message: '新增角色失敗', details: { name, nameE, order, error: error.message } });
    } else if (data) {
      const addedChar = data[0];
      Logger.info({ source: 'character_management', action: 'add_character', message: '新增角色', details: { characterId: addedChar.id, name, nameE, order } });
      setDbState(prev => ({
        ...prev,
        characters: { ...prev.characters, [addedChar.id]: addedChar }
      }));
    }
  };

  const updateCharacter = async (characterId: string, data: Partial<Character>) => {
    const { error } = await supabaseUpdate('characters', data, { id: characterId });
    if (error) {
      console.error('Error updating character:', error);
      Logger.error({ source: 'character_management', action: 'update_character', message: '更新角色失敗', details: { characterId, data, error: error.message } });
    } else {
      Logger.info({ source: 'character_management', action: 'update_character', message: '更新角色', details: { characterId, data } });
      setDbState(prev => ({
        ...prev,
        characters: {
          ...prev.characters,
          [characterId]: { ...prev.characters[characterId], ...data }
        }
      }));
    }
  };

  const deleteCharacter = async (characterId: string) => {
    const { error } = await supabase.from('characters').delete().eq('id', characterId);
    if (error) {
      console.error('Error deleting character:', error);
      Logger.error({ source: 'character_management', action: 'delete_character', message: '刪除角色失敗', details: { characterId, error: error.message } });
    } else {
      Logger.warn({ source: 'character_management', action: 'delete_character', message: '刪除角色', details: { characterId, name: db.characters[characterId]?.name } });
      setDbState(prev => {
        const { [characterId]: _, ...rest } = prev.characters;
        return { ...prev, characters: rest };
      });
    }
  };

  const updateCharactersOrder = async (newOrder: Character[]) => {
    const updates = newOrder.map((char, index) => ({
      id: char.id,
      orderNum: index + 1
    })).filter(u => db.characters[u.id]?.orderNum !== u.orderNum);

    if (updates.length === 0) return;

    // Optimistic update
    setDbState(prev => {
      const newCharacters = { ...prev.characters };
      updates.forEach(u => {
        if (newCharacters[u.id]) {
          newCharacters[u.id] = { ...newCharacters[u.id], orderNum: u.orderNum };
        }
      });
      return { ...prev, characters: newCharacters };
    });

    try {
      await Promise.all(updates.map(u =>
        supabaseUpdate('characters', { orderNum: u.orderNum }, { id: u.id })
      ));
      Logger.info({ source: 'character_management', action: 'update_characters_order', message: '更新角色順序', details: { updates } });
    } catch (error) {
      console.error('Error updating characters order:', error);
      Logger.error({ source: 'character_management', action: 'update_characters_order', message: '更新角色順序失敗', details: { updates, error: (error as any).message } });
      // Revert by fetching fresh data
      const { data, error: fetchError } = await supabase.from('characters').select('id, name, name_e, order_num, atk_type, attribute');
      if (!fetchError && data) {
        const characters = data.reduce((acc, char) => ({ ...acc, [char.id]: toCamel(char) }), {});
        setDbState(prev => ({ ...prev, characters }));
      }
    }
  };

  const addCostume = async (characterId: string, name: string, order: number, nameE: string = '') => {
    const newCostume = { id: uuidv4(), characterId: characterId, name, nameE, orderNum: order, isNew: false };
    const { data, error } = await supabaseInsert('costumes', newCostume);
    if (error) {
      console.error('Error adding costume:', error);
      Logger.error({ source: 'costume_management', action: 'add_costume', message: '新增服裝失敗', details: { characterId, name, nameE, order, error: error.message } });
    } else if (data) {
      const addedCostume = data[0];
      Logger.info({ source: 'costume_management', action: 'add_costume', message: '新增服裝', details: { costumeId: addedCostume.id, characterId, name, nameE, order } });
      setDbState(prev => ({
        ...prev,
        costumes: { ...prev.costumes, [addedCostume.id]: addedCostume }
      }));
    }
  };

  const updateCostume = async (costumeId: string, data: Partial<Costume>) => {
    const { error } = await supabaseUpdate('costumes', data, { id: costumeId });
    if (error) {
      console.error('Error updating costume:', error);
      Logger.error({ source: 'costume_management', action: 'update_costume', message: '更新服裝失敗', details: { costumeId, data, error: error.message } });
    } else {
      Logger.info({ source: 'costume_management', action: 'update_costume', message: '更新服裝', details: { costumeId, data } });
      setDbState(prev => ({
        ...prev,
        costumes: {
          ...prev.costumes,
          [costumeId]: { ...prev.costumes[costumeId], ...data }
        }
      }));
    }
  };

  const deleteCostume = async (costumeId: string) => {
    const { error } = await supabase.from('costumes').delete().eq('id', costumeId);
    if (error) {
      console.error('Error deleting costume:', error);
      Logger.error({ source: 'costume_management', action: 'delete_costume', message: '刪除服裝失敗', details: { costumeId, error: error.message } });
    } else {
      Logger.warn({ source: 'costume_management', action: 'delete_costume', message: '刪除服裝', details: { costumeId, name: db.costumes[costumeId]?.name } });
      setDbState(prev => {
        const { [costumeId]: _, ...rest } = prev.costumes;
        return { ...prev, costumes: rest };
      });
    }
  };

  const updateCostumesOrder = async (newOrder: Costume[]) => {
    const updates = newOrder.map((costume, index) => ({
      id: costume.id,
      orderNum: index + 1
    })).filter(u => db.costumes[u.id]?.orderNum !== u.orderNum);

    if (updates.length === 0) return;

    // Optimistic update
    setDbState(prev => {
      const newCostumes = { ...prev.costumes };
      updates.forEach(u => {
        if (newCostumes[u.id]) {
          newCostumes[u.id] = { ...newCostumes[u.id], orderNum: u.orderNum };
        }
      });
      return { ...prev, costumes: newCostumes };
    });

    try {
      await Promise.all(updates.map((u) =>
        supabaseUpdate('costumes', { orderNum: u.orderNum }, { id: u.id })
      ));
      Logger.info({ source: 'costume_management', action: 'update_costumes_order', message: '更新服裝順序', details: { updates } });
    } catch (error) {
      console.error('Error updating costumes order:', error);
      Logger.error({ source: 'costume_management', action: 'update_costumes_order', message: '更新服裝順序失敗', details: { updates, error: (error as any).message } });
      // Revert by fetching fresh data
      const { data, error: fetchError } = await supabase.from('costumes').select('id, name, name_e, character_id, image_name, order_num, is_new');
      if (!fetchError && data) {
        const costumes = data.reduce((acc, costume) => ({ ...acc, [costume.id]: toCamel(costume) }), {});
        setDbState(prev => ({ ...prev, costumes }));
      }
    }
  };










  const restoreData = async (data: Partial<Database>) => {
    try {
      if (data.guilds) {
        await supabaseUpsert('guilds', Object.values(data.guilds));
      }
      if (data.characters) {
        await supabaseUpsert('characters', Object.values(data.characters));
      }
      if (data.costumes) {
        await supabaseUpsert('costumes', Object.values(data.costumes));
      }
      if (data.members) {
        await supabaseUpsert('members', Object.values(data.members));
      }

      showToast(t('common.restore_success_msg'), 'success');
      Logger.warn({ source: 'data_management', action: 'restore_data', message: '還原備份資料', details: { tables: Object.keys(data) } });
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error restoring data:', error);
      Logger.error({ source: 'data_management', action: 'restore_data', message: '還原備份資料失敗', details: { error: (error as any).message } });
      throw error;
    }
  };



  const updateSetting = async (id: string, updates: Partial<Setting>) => {
    if (isOffline) return;

    const { error } = await supabaseUpsert('settings', { id, ...updates });
    if (error) throw error;

    Logger.info({ source: 'setting_management', action: 'update_setting', message: '更新系統設定', details: { id, updates } });

    setDbState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [id]: {
          ...prev.settings[id],
          ...updates
        }
      }
    }));
  };

  const fetchSettings = async () => {
    if (isOffline) return;

    const { data, error } = await supabase.from('settings').select('id, bgm_url, bgm_default_volume, index_message, index_percent_type, application_pending_count');
    if (error) {
      console.error('Error fetching settings:', error);
      return;
    }

    if (data) {
      const settings = data.reduce((acc, setting) => ({ ...acc, [setting.id]: toCamel(setting) }), {});
      setDbState(prev => ({ ...prev, settings }));
    }
  };

  const fetchApplyMails = async () => {
    if (isOffline) return;
    const { data, error } = await supabase.from('apply_mail').select('id, subject, content, status, created_at').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching apply mails:', error);
      return;
    }
    if (data) {
      const applyMails = data.reduce((acc, mail) => ({ ...acc, [mail.id]: toCamel(mail) }), {});
      setDbState(prev => ({ ...prev, applyMails }));
    }
  };

  const addApplyMail = async (subject: string, content: string) => {
    const newMail = {
      id: uuidv4(),
      subject,
      content,
      status: 'pending',
      loginId: currentUser || 'anonymous'
    };
    const { data, error } = await supabaseInsert('apply_mail', newMail);
    if (error) {
      console.error('Error adding apply mail:', error);
      Logger.error({ source: 'apply_mail', action: 'add_apply_mail', message: '新增申請信件失敗', details: { subject, error: error.message } });
      throw error;
    }
    if (data) {
      const addedMail = data[0] as ApplyMail;
      Logger.info({ source: 'apply_mail', action: 'add_apply_mail', message: '新增申請信件', details: { mailId: addedMail.id, subject } });
      setDbState(prev => ({
        ...prev,
        applyMails: { [addedMail.id]: addedMail, ...prev.applyMails }
      }));
    }
  };

  const updateApplyMail = async (id: string, data: Partial<ApplyMail>) => {
    const { error } = await supabaseUpdate('apply_mail', data, { id });
    if (error) {
      console.error('Error updating apply mail:', error);
      Logger.error({ source: 'apply_mail', action: 'update_apply_mail', message: '更新申請信件失敗', details: { id, data, error: error.message } });
      throw error;
    }
    Logger.info({ source: 'apply_mail', action: 'update_apply_mail', message: '更新申請信件', details: { id, data } });
    setDbState(prev => ({
      ...prev,
      applyMails: {
        ...prev.applyMails,
        [id]: { ...prev.applyMails[id], ...data }
      }
    }));
  };

  const deleteApplyMail = async (id: string) => {
    const { error } = await supabase.from('apply_mail').delete().eq('id', id);
    if (error) {
      console.error('Error deleting apply mail:', error);
      Logger.error({ source: 'apply_mail', action: 'delete_apply_mail', message: '刪除申請信件失敗', details: { id, error: error.message } });
      throw error;
    }
    Logger.warn({ source: 'apply_mail', action: 'delete_apply_mail', message: '刪除申請信件', details: { id, subject: db.applyMails[id]?.subject } });
    setDbState(prev => {
      const { [id]: _, ...rest } = prev.applyMails;
      return { ...prev, applyMails: rest };
    });
  };

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-100 text-stone-500">{t('common.loading')}</div>;
  }

  return (
    <AppContext.Provider value={{
      db, setDb, currentView, setCurrentView, currentUser, setCurrentUser, currentAvatar, userGuildRoles, setuserGuildRoles, userRole, userProfileId, managedGuildIds, canManageGuild,
      fetchMembers, fetchAllMembers, loadMembersByIds, searchMembers, addMember, updateMember, updateMembersNotes, deleteMember, archiveMember, unarchiveMember, updateMemberCostumeLevel, updateMemberExclusiveWeapon, updateMemberProfile,
      loadDiscordRoles,
      fetchInitialData,
      addGuild, updateGuild, deleteGuild,
      addCharacter, updateCharacter, deleteCharacter, updateCharactersOrder,
      addCostume, updateCostume, deleteCostume, updateCostumesOrder,
      updateSetting, fetchSettings,
      fetchApplyMails, addApplyMail, updateApplyMail, deleteApplyMail,
      updateAccessControl,
      restoreData, toasts, showToast, removeToast,
      userVolume, setUserVolume, handleLogout, isLoaded, isRoleLoading, isMembersLoading
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
