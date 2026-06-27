const { PermissionsBitField } = require('discord.js');

function hasPermissions(member, permissions) {
  if (!member) return false;
  const perms = new PermissionsBitField(member.permissions);
  return permissions.every((perm) =>
    perms.has(PermissionsBitField.Flags[perm])
  );
}

/**
 * Checks if a member has any of the specified role IDs.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {string[]} roleIds
 * @returns {boolean}
 */
function hasRole(member, roleIds) {
  if (!member) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

/**
 * Returns a human-readable list of missing permissions.
 */
function missingPermissions(member, permissions) {
  const perms = new PermissionsBitField(member.permissions);
  return permissions.filter(
    (perm) => !perms.has(PermissionsBitField.Flags[perm])
  );
}

module.exports = { hasPermissions, hasRole, missingPermissions };
