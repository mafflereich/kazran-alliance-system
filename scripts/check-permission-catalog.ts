import {
  PERMISSIONS,
  PERMISSION_KEYS,
  LEGACY_PAGE_TO_PERMISSION,
  ROUTE_PERMISSIONS,
  getPermissionDefinition,
  type AccessRoleV2,
} from '../src/shared/lib/permissions';

const roles: AccessRoleV2[] = ['member', 'manager', 'officer', 'admin'];
const problems: string[] = [];

const keys = PERMISSIONS.map(p => p.key);
keys.forEach((k, i) => {
  if (keys.indexOf(k) !== i) problems.push(`duplicate key: ${k}`);
  // <domain>.<action> 或 <domain>.<resource>.<action> 或 ...<scope>.<action>（2–4 段）
  if (!/^[a-z][a-z_]*(\.[a-z][a-z_]*){1,3}$/.test(k)) problems.push(`bad key format: ${k}`);
});

PERMISSIONS.forEach(p => {
  const access: string = p.access;
  if (access !== 'read' && access !== 'write') problems.push(`${p.key}: bad access ${access}`);
  if (!p.label?.zh || !p.label?.en) problems.push(`${p.key}: missing zh/en label`);
  if (!p.description?.zh || !p.description?.en) problems.push(`${p.key}: missing zh/en description`);
  if (!Array.isArray(p.enforcedBy)) problems.push(`${p.key}: enforcedBy must be an array`);
  p.enforcedBy.forEach(enforcement => {
    const source: string = enforcement;
    if (source !== 'frontend' && source !== 'database') {
      problems.push(`${p.key}: unknown enforcement ${source}`);
    }
  });
  if (new Set(p.enforcedBy).size !== p.enforcedBy.length) {
    problems.push(`${p.key}: duplicated enforcement`);
  }

  p.defaults.forEach(d => {
    if (!roles.includes(d.role)) problems.push(`${p.key}: unknown role ${d.role}`);
    if (d.role === 'admin' && d.scope !== 'global') problems.push(`${p.key}: admin grant must be global`);
  });
});

Object.entries(LEGACY_PAGE_TO_PERMISSION).forEach(([pageId, perm]) => {
  if (!getPermissionDefinition(perm)) problems.push(`legacy ${pageId} -> missing ${perm}`);
  if (!keys.includes(perm)) problems.push(`legacy ${pageId} -> not in catalog ${perm}`);
});

Object.entries(ROUTE_PERMISSIONS).forEach(([route, perm]) => {
  if (!keys.includes(perm)) problems.push(`route ${route} -> not in catalog ${perm}`);
});

console.log(`permissions: ${keys.length}`);
console.log(`permission keys exported: ${PERMISSION_KEYS.length}`);
console.log(`legacy pages mapped: ${Object.keys(LEGACY_PAGE_TO_PERMISSION).length}`);
console.log(`routes mapped: ${Object.keys(ROUTE_PERMISSIONS).length}`);
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'OK: no problems');
if (problems.length) process.exit(1);
