import React, { createContext, useContext, useState, useEffect } from 'react';
import { Database, Guild, Member, Costume, Role, User, Character, ArchivedMember, ArchiveHistory, Toast, ToastType, Setting, ApplyMail, AccessControl } from '@/entities/member/types';
import { supabase, supabaseInsert, supabaseUpdate, supabaseUpsert, toCamel } from '@/shared/api/supabase';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/shared/lib/utils';

const defaultData: Database = {
  guilds: {},
  guildOrder: [],
  members: {},
  characters: {},
  costumes: {},
  users: {
    "creator": { username: "creator", role: "creator" },
    "admin": { username: "admin", role: "admin" },
    "manager": { username: "manager", role: "manager" }
  },
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

  // Member functions
  fetchMembers: (guildId: string, columns?: string) => void;
  fetchAllMembers: () => Promise<void>;
  searchMembers: (query: string, includeArchived?: boolean, page?: number, pageSize?: number) => Promise<{ data: Member[], total: number }>;
  addMember: (guildId: string, name: string, role?: Role, note?: string) => Promise<void>;
  updateMember: (memberId: string, data: Partial<Member>) => Promise<void>;
  deleteMember: (memberId: string) => Promise<void>;
  archiveMember: (memberId: string, fromGuildId: string, reason: string) => Promise<void>;
  unarchiveMember: (memberId: string, targetGuildId: string) => Promise<void>;
  updateMemberCostumeLevel: (memberId: string, costumeId: string, level: number) => Promise<void>;
  updateMemberExclusiveWeapon: (memberId: string, characterId: string, hasWeapon: boolean) => Promise<void>;

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

  // User functions
  updateUserPassword: (username: string, password: string) => Promise<void>;
  updateUserRole: (username: string, role: User['role']) => Promise<void>;
  addUser: (user: User) => Promise<void>;
  deleteUser: (username: string) => Promise<void>;

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

  isLoaded: boolean;
  isRoleLoading: boolean;
  isMembersLoading: boolean;
}

import { setUserId } from '@/analytics';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

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

  const [currentUser, setCurrentUserState] = useState<string | null>(() => {
    const user = localStorage.getItem('currentUser');
    const loginTime = localStorage.getItem('loginTimestamp');

    if (user && loginTime) {
      const now = Date.now();
      if (now - parseInt(loginTime, 10) > SESSION_TIMEOUT) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('loginTimestamp');
        return null;
      }
      return user;
    }
    return null;
  });

  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);

  const setCurrentUser = (user: string | null) => {
    setCurrentUserState(user);
    setUserId(user);
    if (user) {
      localStorage.setItem('currentUser', user);
      localStorage.setItem('loginTimestamp', Date.now().toString());
    } else {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('loginTimestamp');
    }
  };

  // 新增：抓取當前登入者權限的函數
  const fetchCurrentUserRole = async (username: string) => {
    setIsRoleLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('username', username) // 只抓自己的資料
        .single(); // 我們預期只會有一筆

      if (error) {
        // PGRST116 means no rows found, which is expected for regular users not in admin_users table
        if (error.code !== 'PGRST116') {
          console.error("無法取得使用者權限:", error);
        } else {
          // For regular users, we can set a default 'member' role in local state if they are logged in
          setDbState(prev => ({
            ...prev,
            users: {
              ...prev.users,
              [username]: { username, role: 'member' }
            }
          }));
        }
        return;
      }

      if (data) {
        setDbState(prev => ({
          ...prev,
          users: {
            ...prev.users,
            [data.username]: toCamel(data) // 把抓到的權限更新進去
          }
        }));
      }
    } catch (err) {
      console.error("取得權限發生錯誤:", err);
    } finally {
      setIsRoleLoading(false);
    }
  };

  useEffect(() => {
    const checkSession = () => {
      if (currentUser) {
        const loginTime = localStorage.getItem('loginTimestamp');
        if (loginTime) {
          const now = Date.now();
          if (now - parseInt(loginTime, 10) > SESSION_TIMEOUT) {
            setCurrentUser(null);
            setCurrentView(null);
            showToast(t('common.session_expired'), 'warning');
          } else {
            // 如果 session 還有效，去抓這個人的真實權限
            fetchCurrentUserRole(currentUser);
          }
        } else {
          // 如果有 currentUser 但沒有 timestamp（防呆），也去抓權限
          fetchCurrentUserRole(currentUser);
        }
      }
    };

    // 網頁剛載入或 currentUser 改變時執行一次
    checkSession();

    const interval = setInterval(checkSession, 3600000); // Check every hour
    return () => clearInterval(interval);
  }, [currentUser]);
  const [loadedStates, setLoadedStates] = useState({
    global: false,
    guilds: false,
    costumes: false,
    characters: false,
    users: false
  });

  const isLoaded = loadedStates.global && loadedStates.guilds && loadedStates.costumes && loadedStates.users && loadedStates.characters;

  const [isOffline, setIsOffline] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [userVolume, setUserVolumeState] = useState<number | null>(() => {
    const saved = localStorage.getItem('userVolume');
    return saved !== null ? Number(saved) : null;
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
        } else if (!session && currentUser) {
          // No session but we have a local user, clear it to stay in sync
          setCurrentUser(null);
          setCurrentView(null);
        }
      } catch (err) {
        console.error("Error initializing auth:", err);
      }
    };

    initAuth();

    let subscription: { unsubscribe: () => void } | null = null;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          setCurrentView(null);
        }
      });
      subscription = data.subscription;
    }

    const fetchInitialData = async () => {
      try {
        const [guildsRes, charactersRes, costumesRes, settingsRes, accessControlRes] = await Promise.all([
          supabase ? supabase.from('guilds').select('*') : { data: [], error: null },
          supabase ? supabase.from('characters').select('*') : { data: [], error: null },
          supabase ? supabase.from('costumes').select('*') : { data: [], error: null },
          supabase ? supabase.from('settings').select('*') : { data: [], error: null },
          supabase ? supabase.from('access_control').select('*') : { data: [], error: null },
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

        setLoadedStates({ global: true, guilds: true, costumes: true, characters: true, users: true });

      } catch (error) {
        console.error("Error fetching initial data:", error);
        setIsOffline(true);
        setLoadedStates({ global: true, guilds: true, costumes: true, characters: true, users: true });
      }
    };

    fetchInitialData();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Keep track of member subscription
  const [memberUnsub, setMemberUnsub] = useState<(() => void) | null>(null);



  // Function to fetch members for a specific guild
  const fetchMembers = async (guildId: string, columns: string = 'id, name, guild_id, role, records, exclusive_weapons, color, total_score, updated_at, status, archive_remark, member_notes(note, is_reserved), member_raid_records(score, season_note)') => {
    if (isOffline) return;

    // Check if we already have members for this guild
    const hasCachedMembers = Object.values(db.members).some(m => m.guildId === guildId);

    // Only show loading if we don't have any data for this guild
    if (!hasCachedMembers) {
      setIsMembersLoading(true);
    }

    const selectQuery = columns;

    const { data, error } = await supabase
      .from('members')
      .select(selectQuery)
      .eq('guild_id', guildId) as unknown as { data: any[], error: Error };

    if (error) {
      console.error("Error fetching members:", error);
      setIsOffline(true);
      showToast(t('common.fetch_members_failed'), 'error');
      setIsMembersLoading(false);
      return;
    }

    const newMembers = data.reduce((acc, member) => {
      const camelMember = toCamel<any>(member);
      const memberNotes = Array.isArray(camelMember.memberNotes) ? camelMember.memberNotes[0] : camelMember.memberNotes;
      const memberRaidRecords = Array.isArray(camelMember.memberRaidRecords) ? camelMember.memberRaidRecords[0] : camelMember.memberRaidRecords;
      // member_notes keys are in snake_case since toCamel uses { deep: false }
      const note = memberNotes?.note || '';
      const isReserved = memberNotes?.is_reserved || false;
      const seasonNote = memberRaidRecords?.seasonNote || memberRaidRecords?.season_note || '';
      const score = memberRaidRecords?.score ?? 0;
      const mappedMember: Member = {
        ...camelMember,
        note,
        isReserved,
        seasonNote,
        score,
      };
      delete (mappedMember as any).memberNotes;
      delete (mappedMember as any).memberRaidRecords;
      return { ...acc, [mappedMember.id!]: mappedMember };
    }, {});

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

    setIsMembersLoading(false);
  };

  const fetchAllMembers = async () => {
    if (isOffline) return;

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

    // Now fetch members with filtered member_raid_records
    // If maxSeasonId is null (no seasons in database), use a non-existent UUID to ensure no records are matched
    // This will result in all members having empty member_raid_records arrays, which will return score=0 and seasonNote=""
    const seasonFilterId = maxSeasonId || '00000000-0000-0000-0000-000000000000';
    
    const { data, error } = await supabase
      .from('members')
      .select('id, name, guild_id, role, records, exclusive_weapons, color, total_score, updated_at, status, archive_remark, member_notes(note, is_reserved), member_raid_records(score, season_note)')
      .eq('member_raid_records.season_id', seasonFilterId);

    if (error) {
      console.error("Error fetching all members:", error);
      return;
    }

    const allMembers: Record<string, Member> = data.reduce((acc, member) => {
      const camelMember = toCamel<any>(member);
      const memberNotes = Array.isArray(camelMember.memberNotes) ? camelMember.memberNotes[0] : camelMember.memberNotes;
      const memberRaidRecords = Array.isArray(camelMember.memberRaidRecords) ? camelMember.memberRaidRecords[0] : camelMember.memberRaidRecords;
      // member_notes keys are in snake_case since toCamel uses { deep: false }
      const note = memberNotes?.note || '';
      const isReserved = memberNotes?.is_reserved || false;
      const seasonNote = memberRaidRecords?.seasonNote || memberRaidRecords?.season_note || '';
      const score = memberRaidRecords?.score ?? 0;
      const mappedMember: Member = {
        ...camelMember,
        note,
        isReserved,
        seasonNote,
        score,
      };
      delete (mappedMember as any).memberNotes;
      delete (mappedMember as any).memberRaidRecords;
      return { ...acc, [mappedMember.id!]: mappedMember };
    }, {});
    setDbState(prev => ({ ...prev, members: allMembers }));
  };

  const searchMembers = async (query: string, includeArchived: boolean = false, page: number = 1, pageSize: number = 20): Promise<{ data: Member[], total: number }> => {
    if (!query.trim()) return { data: [], total: 0 };

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let queryBuilder = supabase
      .from('members')
      .select('id, name, guild_id, role, records, exclusive_weapons, color, total_score, updated_at, status, archive_remark, member_notes(note, is_reserved), member_raid_records(score, season_note)', { count: 'exact' })
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
      return { data: [], total: 0 };
    }

    return { 
      data: (data as any[]).map(m => {
        const camelMember = toCamel<any>(m);
        const memberNotes = Array.isArray(camelMember.memberNotes) ? camelMember.memberNotes[0] : camelMember.memberNotes;
        const memberRaidRecords = Array.isArray(camelMember.memberRaidRecords) ? camelMember.memberRaidRecords[0] : camelMember.memberRaidRecords;
       // member_notes keys are in snake_case since toCamel uses { deep: false }
       const note = memberNotes?.note || '';
       const isReserved = memberNotes?.is_reserved || false;
       const seasonNote = memberRaidRecords?.seasonNote || memberRaidRecords?.season_note || '';
       const score = memberRaidRecords?.score ?? m.score ?? 0;
         const mappedMember: Member = {
           ...camelMember,
           note,
           isReserved,
           seasonNote,
           score,
         };
         delete (mappedMember as any).memberNotes;
         delete (mappedMember as any).memberRaidRecords;
         return mappedMember;
       }), 
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
      showToast(t('common.update_failed'), 'error');
    } else {
      setDbState(prev => ({
        ...prev,
        accessControl: {
          ...prev.accessControl,
          [page]: { page, roles }
        }
      }));
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

    const { data, error } = await supabaseInsert('members', newMember);

    if (error) {
      console.error('Error adding member:', error);
      return;
    }

    if (note || isReserved) {
      await supabase
        .from('member_notes')
        .insert({ member_id: newMemberId, note, is_reserved: isReserved });
    }

    if (data) {
      const addedMember = { ...data[0], note };
      setDbState(prev => ({
        ...prev,
        members: { ...prev.members, [addedMember.id]: addedMember }
      }));
    }
  };

  const updateMemberCostumeLevel = async (memberId: string, costumeId: string, level: number) => {
    const currentRecords = db.members[memberId]?.records || {};
    const updatedRecords = {
      ...currentRecords,
      [costumeId]: { level }
    };

    const now = Date.now();
    const { error } = await supabaseUpdate('members',
      {
        records: updatedRecords,
        updatedAt: now
      },
      {
        id: memberId
      });

    if (error) {
      console.error('Error updating member costume level:', error);
    } else {
      setDbState(prev => ({
        ...prev,
        members: {
          ...prev.members,
          [memberId]: { ...prev.members[memberId], records: updatedRecords, updatedAt: now }
        }
      }));
    }
  };

  const updateMember = async (memberId: string, data: Partial<Member>) => {
    const now = Date.now();
    const { note, isReserved, ...memberData } = data;
    
    const { error } = await supabaseUpdate('members', { ...memberData, updatedAt: now }, { id: memberId });

    // Check if any member_notes fields are being updated
    const hasMemberNotesUpdate = note !== undefined || isReserved !== undefined;

    if (hasMemberNotesUpdate) {
      const { data: existingNote, error: checkError } = await supabase
        .from('member_notes')
        .select('uid')
        .eq('member_id', memberId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing note:', checkError);
      }

      const updateData: any = {};
      if (note !== undefined) updateData.note = note;
      if (isReserved !== undefined) updateData.is_reserved = isReserved;

      if (existingNote) {
        const { error: updateNoteError } = await supabase
          .from('member_notes')
          .update(updateData)
          .eq('member_id', memberId);
        if (updateNoteError) console.error('Error updating member_notes:', updateNoteError);
      } else {
        const { error: insertNoteError } = await supabase
          .from('member_notes')
          .insert({ member_id: memberId, ...updateData });
        if (insertNoteError) console.error('Error inserting member_notes:', insertNoteError);
      }
    }

    if (error) {
      console.error('Error updating member:', error);
    } else {
      setDbState(prev => ({
        ...prev,
        members: { ...prev.members, [memberId]: { ...prev.members[memberId], ...data, updatedAt: now } }
      }));
    }
  };

  const addGuild = async (name: string) => {
    const username = name.toLowerCase();
    const newGuild = { id: uuidv4(), name, tier: 1, orderNum: 99, username };
    const { data, error } = await supabaseInsert('guilds', newGuild);
    if (error) {
      console.error('Error adding guild:', error);
      return null;
    } else if (data) {
      const addedGuild = data[0] as Guild;
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
    } else {
      setDbState(prev => ({ ...prev, guilds: { ...prev.guilds, [guildId]: { ...prev.guilds[guildId], ...updateData } } }));
    }
  };

  const deleteGuild = async (guildId: string) => {
    const { error } = await supabase.from('guilds').delete().eq('id', guildId);
    if (error) {
      console.error('Error deleting guild:', error);
    } else {
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
    } else {
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
          archive_remark,
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

    const archivedMember = toCamel(archivedData) as any;
    const historyArray = archivedMember.membersArchiveHistory ? toCamel(archivedMember.membersArchiveHistory) as any[] : [];
    
    // Sort by archived_at descending to get the latest
    historyArray.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());

    const latestHistory = historyArray[0];
    const archivedAt = latestHistory ? formatDate(latestHistory.archivedAt) : t('common.unknown_time');
    const archiveCount = historyArray.length;
    const remark = t('common.archive_remark', { time: archivedAt, count: archiveCount });

    const { error: updateError } = await supabaseUpdate('members',
      {
        status: 'active',
        guild_id: targetGuildId
      },
      {
        'id': memberId
      });

    if (updateError) throw updateError;

    const { data: existingNote, error: checkError } = await supabase
      .from('member_notes')
      .select('uid')
      .eq('member_id', memberId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing note:', checkError);
    }

    if (existingNote) {
      const { error: updateNoteError } = await supabase
        .from('member_notes')
        .update({ archive_remark: remark })
        .eq('member_id', memberId);
      if (updateNoteError) console.error('Error updating archive_remark:', updateNoteError);
    } else {
      const { error: insertNoteError } = await supabase
        .from('member_notes')
        .insert({ member_id: memberId, archive_remark: remark });
      if (insertNoteError) console.error('Error inserting archive_remark:', insertNoteError);
    }

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
    const { error } = await supabaseUpdate('members',
      {
        exclusiveWeapons: updatedWeapons,
        updatedAt: now
      },
      {
        id: memberId
      });


    if (error) {
      console.error('Error updating exclusive weapon:', error);
    } else {
      setDbState(prev => ({
        ...prev,
        members: {
          ...prev.members,
          [memberId]: { ...prev.members[memberId], exclusiveWeapons: updatedWeapons, updatedAt: now }
        }
      }));
    }
  };

  const addCharacter = async (name: string, order: number, nameE: string = '') => {
    const newChar = { id: uuidv4(), name, nameE, orderNum: order };
    const { data, error } = await supabaseInsert('characters', newChar);
    if (error) {
      console.error('Error adding character:', error);
    } else if (data) {
      const addedChar = data[0];
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
    } else {
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
    } else {
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
    } catch (error) {
      console.error('Error updating characters order:', error);
      // Revert by fetching fresh data
      const { data, error: fetchError } = await supabase.from('characters').select('*');
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
    } else if (data) {
      const addedCostume = data[0];
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
    } else {
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
    } else {
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
    } catch (error) {
      console.error('Error updating costumes order:', error);
      // Revert by fetching fresh data
      const { data, error: fetchError } = await supabase.from('costumes').select('*');
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
      if (data.users) {
        await supabaseUpsert('admin_users', Object.values(data.users));
      }

      showToast(t('common.restore_success_msg'), 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error restoring data:', error);
      throw error;
    }
  };

  const updateUserPassword = async (username: string, password: string) => {
    const { error } = await supabaseUpdate('admin_users', { password }, { username: username });
    if (error) {
      console.error('Error updating user password:', error);
    } else {
      setDbState(prev => ({
        ...prev,
        users: {
          ...prev.users,
          [username]: { ...prev.users[username], password }
        }
      }));
    }
  };

  const updateUserRole = async (username: string, role: User['role']) => {
    const { error } = await supabaseUpdate('admin_users', { role }, { username: username });
    if (error) {
      console.error('Error updating user role:', error);
    } else {
      setDbState(prev => ({
        ...prev,
        users: {
          ...prev.users,
          [username]: { ...prev.users[username], role }
        }
      }));
    }
  };

  const addUser = async (user: User) => {
    const { data, error } = await supabaseInsert('admin_users', user);
    if (error) {
      console.error('Error adding user:', error);
    } else if (data) {
      const addedUser = data[0] as User;
      setDbState(prev => ({
        ...prev,
        users: { ...prev.users, [addedUser.username]: addedUser }
      }));
    }
  };

  const deleteUser = async (username: string) => {
    const { error } = await supabase.from('admin_users').delete().eq('username', username);
    if (error) {
      console.error('Error deleting user:', error);
    } else {
      setDbState(prev => {
        const { [username]: _, ...rest } = prev.users;
        return { ...prev, users: rest };
      });
    }
  };

  const updateSetting = async (id: string, updates: Partial<Setting>) => {
    if (isOffline) return;

    const { error } = await supabaseUpsert('settings', { id, ...updates });
    if (error) throw error;

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

    const { data, error } = await supabase.from('settings').select('*');
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
    const { data, error } = await supabase.from('apply_mail').select('*').order('created_at', { ascending: false });
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
      throw error;
    }
    if (data) {
      const addedMail = data[0] as ApplyMail;
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
      throw error;
    }
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
      throw error;
    }
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
      db, setDb, currentView, setCurrentView, currentUser, setCurrentUser,
      fetchMembers, fetchAllMembers, searchMembers, addMember, updateMember, deleteMember, archiveMember, unarchiveMember, updateMemberCostumeLevel, updateMemberExclusiveWeapon,
      addGuild, updateGuild, deleteGuild,
      addCharacter, updateCharacter, deleteCharacter, updateCharactersOrder,
      addCostume, updateCostume, deleteCostume, updateCostumesOrder,
      updateUserPassword, updateUserRole, addUser, deleteUser, updateSetting, fetchSettings,
      fetchApplyMails, addApplyMail, updateApplyMail, deleteApplyMail,
      updateAccessControl,
      restoreData, toasts, showToast, removeToast,
      userVolume, setUserVolume, isLoaded, isRoleLoading, isMembersLoading
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
