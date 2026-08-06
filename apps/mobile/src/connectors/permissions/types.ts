/**
 * Per-connector permission state (task 2.2).
 *
 * Research 0001 is explicit that permission is scoped per connector —
 * "granting the Search connector network access does not grant Sovereign
 * Tasks connector access, and vice versa". There is deliberately no app-wide
 * "allow network" switch to turn on, because a single switch is exactly the
 * blanket grant the product exists to avoid.
 */

export type GrantState =
  /** Never asked. The honest default: absence of a decision, not a denial. */
  | 'not-asked'
  /** The user granted this connector its declared access. */
  | 'granted'
  /**
   * The user refused, or revoked a previous grant.
   *
   * Distinct from `not-asked` so the UI can avoid re-prompting for something
   * already turned down — a permission dialog that reappears until answered
   * "correctly" is coercion, not consent.
   */
  | 'denied';

export type ConnectorGrant = {
  connectorId: string;
  state: GrantState;
  /** When the current state was set, for the settings surface. */
  decidedAt: string | null;
  /**
   * The origins the user actually agreed to, copied from the manifest at
   * grant time.
   *
   * Stored rather than re-read so that a connector update which widens
   * `permissions.network.origins` cannot silently inherit the old consent.
   * The runtime compares the two and treats a widened set as needing a fresh
   * decision.
   */
  grantedOrigins: string[];
};
