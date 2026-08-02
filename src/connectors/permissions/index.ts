export {
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
