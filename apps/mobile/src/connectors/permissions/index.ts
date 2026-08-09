export {
  connectorScope,
  deny,
  grant,
  grantFor,
  isAllowed,
  listGrants,
  needsRedecision,
  revoke,
} from './grants';
export { openVault, type ConnectorVault } from './vault';
export type { ConnectorGrant, GrantState } from './types';
export {
  grantEntitlement,
  hasEntitlement,
  isConnectorUsable,
  listEntitlements,
  revokeEntitlement,
  type EntitlementRecord,
} from './entitlements';
export { ensureCalendarAccess } from './calendarAccess';
