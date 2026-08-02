import * as SecureStore from 'expo-secure-store';

/**
 * Per-connector credential storage, backed by the OS keychain (task 2.2).
 *
 * The isolation requirement — "one connector's token is never visible to
 * another" — is met **by construction rather than by discipline**. There is
 * no exported function that takes a connector id and a key; the only way to
 * reach a credential is through a `ConnectorVault` handle, and a handle can
 * only ever address its own connector's namespace because it closes over the
 * id and builds every key itself.
 *
 * A caller holding Search's vault cannot name Sovereign Tasks' token. Not
 * "should not" — cannot, without going around this module to
 * `expo-secure-store` directly, which is a visible, reviewable act rather
 * than an easy mistake.
 *
 * Values go to the iOS keychain and Android EncryptedSharedPreferences, so
 * they are not readable from a filesystem dump of the app container the way
 * `AsyncStorage` would be.
 */

/** Keys are namespaced so two connectors cannot collide, accidentally or otherwise. */
const NAMESPACE = 'sovereign.connector';

/**
 * SecureStore keys are restricted to alphanumerics, `.`, `-`, and `_`.
 * Connector ids and credential keys are already constrained by the manifest
 * schema, so this is a belt-and-braces guard against a caller that skipped
 * validation rather than an expected path.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export type ConnectorVault = {
  readonly connectorId: string;
  /** Reads one of this connector's credentials. Null when never stored. */
  read(credentialKey: string): Promise<string | null>;
  write(credentialKey: string, value: string): Promise<void>;
  /** Removes the named credentials. Used when a grant is revoked. */
  clear(credentialKeys: string[]): Promise<void>;
};

function assertSafe(segment: string, what: string): void {
  if (!SAFE_SEGMENT.test(segment)) {
    throw new Error(
      `Unsafe ${what} "${segment}". Expected only letters, digits, ".", "-", ` +
        'or "_". A manifest that reached here without validation is a bug.',
    );
  }
}

/**
 * Opens the credential namespace for one connector.
 *
 * The id is validated once, here, so every key derived from it afterwards is
 * known safe.
 */
export function openVault(connectorId: string): ConnectorVault {
  assertSafe(connectorId, 'connector id');

  const keyFor = (credentialKey: string) => {
    assertSafe(credentialKey, 'credential key');
    return `${NAMESPACE}.${connectorId}.${credentialKey}`;
  };

  return {
    connectorId,
    read: (credentialKey) => SecureStore.getItemAsync(keyFor(credentialKey)),
    write: (credentialKey, value) =>
      SecureStore.setItemAsync(keyFor(credentialKey), value),
    clear: async (credentialKeys) => {
      // Sequential rather than parallel: a partial failure should leave the
      // rest deleted, and the keychain is not a hot path.
      for (const credentialKey of credentialKeys) {
        await SecureStore.deleteItemAsync(keyFor(credentialKey));
      }
    },
  };
}
