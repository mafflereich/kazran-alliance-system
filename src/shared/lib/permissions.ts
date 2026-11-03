/**
 * 權限目錄 v2（Single Capability Catalog）
 *
 * 設計原則（完整說明見 docs/plans/2026-11-02-permissions-v2.md）：
 *   1. 這支檔案只回答「系統有哪些權限」、「哪個路由需要哪個權限」。
 *   2. 「誰有這個權限」一律由 DB 的 role_grants 決定，前端只消費
 *      get_my_access() 回傳的清單，不在瀏覽器重算角色規則。
 *   3. 角色是標籤（member / manager / officer / admin），不是階級；
 *      公會級的授權一律用 scope = managed 表達（officer 只在自己管理的公會生效）。
 *
 * 分類規則（2026-11-03 重整）：
 *   - 每個權限只能是「讀取（read）」或「操作（write）」其中一種，不合併。
 *     看得到 ≠ 改得動：要給某人操作能力時，請同時確認他是否有對應的讀取權限。
 *   - domain = 功能分類（頁面／裝備／成員／聯合戰／申請信箱／後台／小遊戲），
 *     後台可依此篩選；label / description 是唯一顯示來源，不要在其他檔案重寫。
 *   - enforcedBy 記錄「這個 key 目前真的被哪裡讀取」：
 *       frontend = 路由或畫面會用 can(key) 擋
 *       database = RLS / RPC 會用 has_permission(key) 擋
 *       空陣列     = 只存在目錄，切換它目前不會改變行為（後台會標「尚未接線」）
 *   - 不得為了畫面好看而新增 key；新權限一定要有對應的實際檢查點。
 */

export const ACCESS_ROLES_V2 = ['member', 'manager', 'officer', 'admin'] as const;
export type AccessRoleV2 = (typeof ACCESS_ROLES_V2)[number];

/** global = 全站有效；managed = 只在自己是 leader/coleader 的公會有效 */
export type GrantScope = 'global' | 'managed';

/** 讀 = 看得到；操作 = 改得動。單一權限只屬於一種，避免語意含糊。 */
export type PermissionAccess = 'read' | 'write';

export interface PermissionText {
  zh: string;
  en: string;
}

/** 這個 key 目前真的被哪裡讀取（空陣列 = 尚未接線） */
export type PermissionEnforcement = 'frontend' | 'database';

export interface DefaultGrant {
  role: AccessRoleV2;
  scope: GrantScope;
}

export type PermissionDomain =
  | 'page'
  | 'equipment'
  | 'member'
  | 'raid'
  | 'mailbox'
  | 'admin'
  | 'arcade';

export interface PermissionDefinition {
  /** 全域唯一 key：2–4 段，`<domain>.<action>` 或 `<domain>.<resource>.<action>` */
  key: string;
  /** 功能分類（後台篩選用） */
  domain: PermissionDomain;
  /** 讀取或操作（單選，不合併） */
  access: PermissionAccess;
  /** true = 資料層檢查必須帶 guildId（RLS 只接受這個版本） */
  needsGuild: boolean;
  /** 顯示名稱（唯一來源） */
  label: PermissionText;
  /** 實際功能說明：這個開關到底會交出什麼權力（唯一來源） */
  description: PermissionText;
  /** 目前實際的檢查點；空陣列代表切換後不會有任何效果 */
  enforcedBy: readonly PermissionEnforcement[];
  /** 預設授權；實際生效值仍以 DB 的 role_grants 為準 */
  defaults: readonly DefaultGrant[];
}

/** 讓目錄讀起來像一張表：G = 全站、M = 只在自己管理的公會 */
const G = (role: AccessRoleV2): DefaultGrant => ({ role, scope: 'global' });
const M = (role: AccessRoleV2): DefaultGrant => ({ role, scope: 'managed' });

/** 分類顯示順序與名稱（後台篩選、分組都用這份） */
export const PERMISSION_DOMAIN_ORDER: readonly PermissionDomain[] = [
  'page',
  'equipment',
  'member',
  'raid',
  'mailbox',
  'admin',
  'arcade',
];

export const PERMISSION_DOMAIN_LABELS: Record<PermissionDomain, PermissionText> = {
  page: { zh: '頁面進出', en: 'Page access' },
  equipment: { zh: '裝備／服裝', en: 'Equipment' },
  member: { zh: '成員資料', en: 'Members' },
  raid: { zh: '聯合戰', en: 'Raid' },
  mailbox: { zh: '申請信箱', en: 'Mailbox' },
  admin: { zh: '後台管理', en: 'Admin' },
  arcade: { zh: '小遊戲', en: 'Arcade' },
};

export const PERMISSION_ACCESS_LABELS: Record<PermissionAccess, PermissionText> = {
  read: { zh: '讀取', en: 'Read' },
  write: { zh: '操作', en: 'Write' },
};

/** 接線狀態的顯示文字；'none' 代表目錄有這個 key、但沒有任何檢查點 */
export const PERMISSION_ENFORCEMENT_LABELS: Record<PermissionEnforcement | 'none', PermissionText> = {
  frontend: { zh: '前端檢查', en: 'Frontend' },
  database: { zh: '資料庫檢查', en: 'Database' },
  none: { zh: '尚未接線', en: 'Not wired' },
};

/**
 * 權限目錄（單一來源）。
 *
 * 新增權限的步驟：
 *   1. 這裡加一筆：domain / access / needsGuild / label / description / enforcedBy / 預設授權。
 *   2. `scripts/gen-permission-catalog.ts` 把目錄同步到 DB 的 permissions / role_grants。
 *   3. 後台「權限」分頁會自動長出這一列，不需要改 UI。
 *   4. 需要擋路由 / 按鈕時，用 `<RouteGate perm="...">` / `<Can perm="...">`；
 *      enforcedBy 必須同時更新，否則後台會標「尚未接線」。
 */
export const PERMISSIONS = [
  // ── 頁面進出（只影響導覽與路由，不等於資料安全）────────────────────────
  {
    key: 'page.equipment.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '裝備表', en: 'Equipment table' },
    description: {
      zh: '可以開啟裝備表頁面；實際能看到誰的裝備，仍由各成員的隱私設定決定。',
      en: 'Open the equipment page; who you can actually see still depends on each member’s privacy settings.',
    },
    enforcedBy: ['frontend'],
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },
  {
    key: 'page.my_costumes.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '服裝表', en: 'Costumes' },
    description: {
      zh: '可以開啟服裝表與專屬武器收集頁。',
      en: 'Open the costume collection page.',
    },
    enforcedBy: ['frontend'],
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },
  {
    key: 'page.mailbox.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '申請信箱', en: 'Application mailbox' },
    description: {
      zh: '可以開啟申請信箱：送出申請、查看自己的申請進度。',
      en: 'Open the application mailbox: submit applications and track your own.',
    },
    enforcedBy: ['frontend'],
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },
  {
    key: 'page.arcade.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '小遊戲', en: 'Arcade' },
    description: {
      zh: '可以開啟小遊戲區（例如極速精煉）。',
      en: 'Open the arcade page (e.g. speed refining).',
    },
    enforcedBy: ['frontend'],
    defaults: [G('manager'), G('admin')],
  },
  {
    key: 'page.toolbox.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '小工具', en: 'Toolbox' },
    description: {
      zh: '可以開啟小工具區。',
      en: 'Open the toolbox page.',
    },
    enforcedBy: ['frontend'],
    defaults: [G('manager'), G('admin')],
  },
  {
    key: 'page.raid.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '聯盟戰記', en: 'Alliance raid record' },
    description: {
      zh: '可以開啟聯盟戰記 /raid，唯讀檢視所有公會的賽季紀錄。',
      en: 'Open the alliance raid record /raid (read-only, all guilds).',
    },
    enforcedBy: ['frontend'],
    defaults: [G('manager'), M('officer'), G('admin')],
  },
  {
    key: 'page.raid_manage.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '公會聯合戰管理', en: 'Guild raid manager' },
    description: {
      zh: '可以開啟 /raid-manager；沒有 raid.score.write 時表格為唯讀，沒有 raid.checkin.write 時不能簽到。',
      en: 'Open /raid-manager; without raid.score.write the table is read-only, and without raid.checkin.write you cannot check members in.',
    },
    enforcedBy: ['frontend'],
    defaults: [G('manager'), M('officer'), G('admin')],
  },
  {
    key: 'page.member_board.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '團隊看板', en: 'Team assign board' },
    description: {
      zh: '可以開啟 Team Assign Board /team（目前僅 admin 能進，資料庫寫入也限 admin）。',
      en: 'Open the Team Assign Board /team (currently admin-only; database writes are admin-only too).',
    },
    enforcedBy: ['frontend'],
    defaults: [G('admin')],
  },
  {
    key: 'page.admin.view',
    domain: 'page',
    access: 'read',
    needsGuild: false,
    label: { zh: '後台', en: 'Admin' },
    description: {
      zh: '可以開啟後台 /admin；每個分頁仍需要對應的 admin.* 操作權限（且目前只對 admin 身分開放）。',
      en: 'Open /admin; each tab still needs its matching admin.* write permission (and is currently admin-only).',
    },
    enforcedBy: ['frontend'],
    defaults: [G('admin')],
  },

  // ── 裝備／服裝 ──────────────────────────────────────────────────────
  {
    // 對應 members.equipment_visibility = 'guild_manager'
    key: 'equipment.read.managed',
    domain: 'equipment',
    access: 'read',
    needsGuild: true,
    label: { zh: '讀取本公會裝備', en: 'Read own-guild equipment' },
    description: {
      zh: '讀取「自己管理的公會」成員裝備（成員設為不公開的項目仍會遮蔽）。',
      en: 'Read equipment of members in guilds you manage (items set to private stay masked).',
    },
    enforcedBy: ['database'],
    defaults: [M('officer'), G('admin')],
  },
  {
    // 對應 members.equipment_visibility = 'all_manager'
    key: 'equipment.read.staff',
    domain: 'equipment',
    access: 'read',
    needsGuild: false,
    label: { zh: '讀取全部裝備', en: 'Read all equipment' },
    description: {
      zh: '讀取所有公會成員的裝備（不受公會限制；成員的隱私設定仍會遮蔽）。',
      en: 'Read equipment of members in every guild (member privacy settings still apply).',
    },
    enforcedBy: ['database'],
    defaults: [G('manager'), G('admin')],
  },
  {
    key: 'equipment.write.self',
    domain: 'equipment',
    access: 'write',
    needsGuild: false,
    label: { zh: '編輯自己裝備', en: 'Edit own equipment' },
    description: {
      zh: '編輯自己的裝備與重要資源。',
      en: 'Edit your own equipment and important resources.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },
  {
    key: 'equipment.visibility.configure',
    domain: 'equipment',
    access: 'write',
    needsGuild: false,
    label: { zh: '設定裝備可見度', en: 'Configure visibility' },
    description: {
      zh: '調整自己裝備／資源的可見度與「請更新」提醒設定。',
      en: 'Configure your own equipment/resource visibility and update reminders.',
    },
    enforcedBy: ['database'],
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },

  // ── 成員資料 ───────────────────────────────────────────────────────
  {
    key: 'member.edit.managed',
    domain: 'member',
    access: 'write',
    needsGuild: true,
    label: { zh: '編輯成員資料', en: 'Edit member profile' },
    description: {
      zh: '編輯自己管理公會成員的資料（名稱、角色、所屬公會）。注意：名稱／角色／所屬公會等身分欄位在資料庫仍只允許 admin 修改。',
      en: 'Edit member profiles (name, role, guild) in guilds you manage. Note: identity fields (name/role/guild) are still admin-only at the database level.',
    },
    enforcedBy: ['database'],
    defaults: [G('admin')],
  },
  {
    key: 'member.archive',
    domain: 'member',
    access: 'write',
    needsGuild: false,
    label: { zh: '封存成員', en: 'Archive members' },
    description: {
      zh: '封存成員並填寫封存原因（archive_members_bulk；目前只有 admin 可執行）。',
      en: 'Archive members with an archive reason (archive_members_bulk; currently admin-only).',
    },
    enforcedBy: ['database'],
    defaults: [G('admin')],
  },
  {
    key: 'member.note.write.managed',
    domain: 'member',
    access: 'write',
    needsGuild: true,
    label: { zh: '編輯成員備註', en: 'Edit member notes' },
    description: {
      zh: '編輯自己管理公會成員的成員備註與賽季備註。',
      en: 'Edit member notes and season notes in guilds you manage.',
    },
    enforcedBy: ['database'],
    defaults: [M('officer'), G('admin')],
  },

  // ── 聯合戰 ─────────────────────────────────────────────────────────
  {
    key: 'raid.score.write',
    domain: 'raid',
    access: 'write',
    needsGuild: true,
    label: { zh: '編輯戰記分數', en: 'Edit raid scores' },
    description: {
      zh: '編輯分數／擊殺／超殺／賽季備註、清除賽季記錄，以及開季複製與封存時寫入成員紀錄；同時是 /raid-manager 表格可否編輯的開關。前端只顯示自己管理的公會；資料庫目前以「任一公會幹部」放行整季寫入。',
      en: 'Edit scores, records, overkill and season notes; clear season records; write member records when creating/archiving a season; also unlocks the /raid-manager table. The UI limits officers to their own guilds, but the database currently lets any guild officer write the whole season.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [M('officer'), G('admin')],
  },
  {
    key: 'raid.season.manage',
    domain: 'raid',
    access: 'write',
    needsGuild: false,
    label: { zh: '賽季管理', en: 'Manage seasons' },
    description: {
      zh: '開季、編輯賽季設定、封存賽季（raid_seasons 的新增／修改／刪除）。賽季是聯盟層級資料（沒有公會欄位），因此對幹部為全站生效；開季複製與封存補寫成員紀錄另需 raid.score.write。',
      en: 'Create seasons, edit season settings and archive seasons (raid_seasons insert/update/delete). Seasons are alliance-level (no guild column), so this is global for officers; copying records on create/archive also needs raid.score.write.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('officer'), G('admin')],
  },
  {
    key: 'raid.ghost.manage',
    domain: 'raid',
    access: 'write',
    needsGuild: true,
    label: { zh: '幽靈紀錄', en: 'Ghost records' },
    description: {
      zh: '新增／刪除幽靈（招魂）紀錄（ghost_records）。讀取招魂紀錄不需要這個權限。',
      en: 'Add or delete ghost records (ghost_records). Viewing ghost records does not require this permission.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [M('officer'), G('admin')],
  },
  {
    key: 'raid.roster.move',
    domain: 'raid',
    access: 'write',
    needsGuild: true,
    label: { zh: '成員移轉公告', en: 'Move members' },
    description: {
      zh: '產生並公告成員移轉名冊：比對前後賽季的 season_guild，列出各公會送出／招收名單，可複製或呼叫外部 API 產生 Discord 公告；不會修改成員資料。',
      en: 'Build and announce roster moves from each season’s season_guild: lists who leaves/joins each guild, then copies or calls an external API for a Discord announcement. It does not modify member data.',
    },
    enforcedBy: ['frontend'],
    defaults: [M('officer'), G('admin')],
  },
  {
    key: 'raid.checkin.write',
    domain: 'raid',
    access: 'write',
    needsGuild: true,
    label: { zh: '成員簽到', en: 'Member check-in' },
    description: {
      zh: '標記與重置成員的報名／簽到狀態（set_member_checkin_marks / reset_guild_checkin_marks）。',
      en: 'Mark and reset member sign-up / check-in status (set_member_checkin_marks / reset_guild_checkin_marks).',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [M('officer'), G('admin')],
  },

  // ── 申請信箱 ───────────────────────────────────────────────────────
  {
    key: 'mailbox.process',
    domain: 'mailbox',
    access: 'write',
    needsGuild: false,
    label: { zh: '處理申請', en: 'Process applications' },
    description: {
      zh: '審核加入申請：修改狀態與刪除申請（apply_mail UPDATE／DELETE）。申請信箱是全聯盟共用（沒有公會欄位），因此對幹部為全站生效；讀取申請仍對所有登入者開放。',
      en: 'Review applications: update status and delete applications (apply_mail UPDATE/DELETE). The mailbox is alliance-wide (no guild column), so this is global for officers; reading applications stays open to all signed-in users.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('officer'), G('admin')],
  },

  // ── 後台管理 ───────────────────────────────────────────────────────
  {
    key: 'admin.guild.manage',
    domain: 'admin',
    access: 'write',
    needsGuild: false,
    label: { zh: '公會管理', en: 'Manage guilds' },
    description: {
      zh: '新增、修改與刪除公會（guilds 表的全部寫入）。',
      en: 'Create, edit and delete guilds (all writes to guilds).',
    },
    enforcedBy: ['database'],
    defaults: [G('admin')],
  },
  {
    key: 'admin.costume.manage',
    domain: 'admin',
    access: 'write',
    needsGuild: false,
    label: { zh: '服裝資料庫', en: 'Costume database' },
    description: {
      zh: '維護服裝與角色資料庫（costumes 表的全部寫入）。',
      en: 'Maintain the costume and character database (all writes to costumes).',
    },
    enforcedBy: ['database'],
    defaults: [G('admin')],
  },
  {
    key: 'admin.identity.manage',
    domain: 'admin',
    access: 'write',
    needsGuild: false,
    label: { zh: '身分綁定', en: 'Identity binding' },
    description: {
      zh: '綁定 Discord 帳號與遊戲成員、處理認領申請（後台「身分綁定」分頁）。',
      en: 'Bind Discord accounts to game members and handle claims (Admin → Identity binding).',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('admin')],
  },
  {
    key: 'admin.logs.read',
    domain: 'admin',
    access: 'read',
    needsGuild: false,
    label: { zh: '系統日誌', en: 'System logs' },
    description: {
      zh: '查看系統日誌（後台「系統日誌」分頁；包含權限變更稽核）。',
      en: 'Read system logs (Admin → System logs, including permission audit entries).',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('admin')],
  },
  {
    key: 'admin.tools.run',
    domain: 'admin',
    access: 'write',
    needsGuild: false,
    label: { zh: '工具', en: 'Tools' },
    description: {
      zh: '執行後台工具：備份還原、CSV 匯入／匯出、Discord 名單同步。',
      en: 'Run admin tools: backup/restore, CSV import/export and Discord member sync.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('admin')],
  },
  {
    key: 'admin.settings.manage',
    domain: 'admin',
    access: 'write',
    needsGuild: false,
    label: { zh: '系統設定', en: 'Settings' },
    description: {
      zh: '修改全站系統設定。',
      en: 'Change site-wide settings.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('admin')],
  },
  {
    key: 'admin.permission.manage',
    domain: 'admin',
    access: 'write',
    needsGuild: false,
    label: { zh: '權限設定', en: 'Permission settings' },
    description: {
      zh: '調整角色權限矩陣與例外授權（role_grants / user_grants 寫入；資料庫目前仍以 admin 身分為準）。',
      en: 'Change role grants and user overrides (writes to role_grants / user_grants; the database still checks the admin role).',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('admin')],
  },
  {
    key: 'admin.role.assign',
    domain: 'admin',
    access: 'write',
    needsGuild: false,
    label: { zh: '指派角色', en: 'Assign roles' },
    description: {
      zh: '指派使用者的 manager / member 角色（profiles.user_role）。',
      en: 'Assign the manager / member role to users (profiles.user_role).',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('admin')],
  },

  {
    key: 'admin.archive.read',
    domain: 'admin',
    access: 'read',
    needsGuild: false,
    label: { zh: '封存成員紀錄', en: 'Archived members' },
    description: {
      zh: '讀取後台「封存成員」清單與封存原因（members_archive_history）。封存／還原成員仍是 member.archive。',
      en: 'Read the archived-members list and archive reasons (members_archive_history). Archiving/restoring still requires member.archive.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('manager'), G('admin')],
  },

  // ── 小遊戲 ─────────────────────────────────────────────────────────
  {
    // 目前寫死 userRole === 'creator'；新方案視為一般後台權限
    key: 'arcade.speed_refining.use',
    domain: 'arcade',
    access: 'write',
    needsGuild: false,
    label: { zh: '極速精煉', en: 'Speed refining' },
    description: {
      zh: '使用極速精煉模擬器與寫入排行榜（lb_speedrefining）。頁面入口另由 page.arcade.view 控制。',
      en: 'Use the speed refining simulator and write leaderboard scores (lb_speedrefining). Page entry is controlled by page.arcade.view.',
    },
    enforcedBy: ['frontend', 'database'],
    defaults: [G('manager'), G('admin')],
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map(p => p.key);

const PERMISSION_MAP: ReadonlyMap<string, PermissionDefinition> = new Map(
  PERMISSIONS.map(definition => [definition.key, definition]),
);

export const getPermissionDefinition = (key: string): PermissionDefinition | undefined =>
  PERMISSION_MAP.get(key);

export const isPermissionKey = (key: string): key is PermissionKey => PERMISSION_MAP.has(key);

/** 顯示名稱（後台唯一來源；找不到時回退 key） */
export const getPermissionLabel = (key: string, isZh: boolean): string => {
  const definition = PERMISSION_MAP.get(key);
  if (!definition) return key;
  return isZh ? definition.label.zh : definition.label.en;
};

/** 實際功能說明（後台唯一來源；找不到時回傳空字串） */
export const getPermissionDescription = (key: string, isZh: boolean): string => {
  const definition = PERMISSION_MAP.get(key);
  if (!definition) return '';
  return isZh ? definition.description.zh : definition.description.en;
};

/** 這個 key 目前是否有任何實際檢查點（false = 切換後不會改變行為） */
export const isPermissionWired = (key: string): boolean =>
  (PERMISSION_MAP.get(key)?.enforcedBy.length ?? 0) > 0;

/** 依分類分組，順序固定為 PERMISSION_DOMAIN_ORDER */
export const groupPermissionsByDomain = (): {
  domain: PermissionDomain;
  items: PermissionDefinition[];
}[] =>
  PERMISSION_DOMAIN_ORDER.map(domain => ({
    domain,
    items: PERMISSIONS.filter(permission => permission.domain === domain),
  })).filter(group => group.items.length > 0);


/** 舊 pageId → 新權限 key（找不到時 undefined；避免用 string 索引 literal 物件） */
export const legacyPagePermission = (pageId: string): PermissionKey | undefined =>
  (LEGACY_PAGE_TO_PERMISSION as Record<string, PermissionKey>)[pageId];

/**
 * get_my_access() 的回傳形狀（Phase 1）。
 * version = 0 表示 DB 尚未提供 v2 資料，前端必須回退到舊規則。
 */
export interface MyAccess {
  roles: AccessRoleV2[];
  isAdmin: boolean;
  managedGuildIds: string[];
  /** 我所屬的公會（成員綁定）；manager 只看自己公會時會用到 */
  memberGuildIds: string[];
  globalPermissions: PermissionKey[];
  managedPermissions: PermissionKey[];
  version: number;
}

export const EMPTY_ACCESS: MyAccess = {
  roles: [],
  isAdmin: false,
  managedGuildIds: [],
  memberGuildIds: [],
  globalPermissions: [],
  managedPermissions: [],
  version: 0,
};

// 後台 i18n key（admin namespace）：permissions.<key>.label / .description
export const permissionLabelKey = (key: string): string => `permissions.${key}.label`;
export const permissionDescriptionKey = (key: string): string => `permissions.${key}.description`;
export const roleLabelKey = (role: AccessRoleV2): string => `permissions.roles.${role}`;

/**
 * 舊 pageId → 新權限 key。
 *
 * Phase 1 的相容層就靠這張表：`usePermissions().canAccessPage(pageId)` 改成
 * `can(LEGACY_PAGE_TO_PERMISSION[pageId])`，所有既有呼叫端（Header、ProtectedRoute、
 * 各頁面）完全不用改，可見性與 access_control 完全一致。
 *
 * 注意：舊程式 `/raid` 與 `/raid-manager` 共用 `guild_raid_manager`，這裡先映射到
 * `page.raid_manage.view` 以維持完全相同的可見性；Phase 2 再把 `/raid` 拆成
 * `page.raid.view`。
 */
export const LEGACY_PAGE_TO_PERMISSION = {
  costume_list: 'page.equipment.view',
  my_costumes: 'page.my_costumes.view',
  application_mailbox: 'page.mailbox.view',
  arcade: 'page.arcade.view',
  toolbox: 'page.toolbox.view',
  guild_raid_manager: 'page.raid_manage.view',
  member_board: 'page.member_board.view',
  admin_settings: 'page.admin.view',
  alliance_raid_record: 'page.raid.view',
} as const satisfies Record<string, PermissionKey>;

/** 路由 → 頁面權限（Phase 2 的 RouteGate 使用） */
export const ROUTE_PERMISSIONS = {
  '/guild/:guildId': 'page.equipment.view',
  '/costumes': 'page.my_costumes.view',
  '/mailbox': 'page.mailbox.view',
  '/arcade': 'page.arcade.view',
  '/toolbox': 'page.toolbox.view',
  '/raid': 'page.raid.view',
  '/raid-manager': 'page.raid_manage.view',
  '/team': 'page.member_board.view',
  '/admin': 'page.admin.view',
} as const satisfies Record<string, PermissionKey>;
