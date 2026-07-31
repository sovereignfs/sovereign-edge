import { NativeModule, requireNativeModule } from 'expo';

declare class SovereignHashingModule extends NativeModule {
  /**
   * Lowercase hex SHA-256 of the file at `path`, hashed natively.
   *
   * Accepts a filesystem path or a `file://` URI. Rejects with
   * `ERR_FILE_NOT_READABLE` if the file is missing or unreadable.
   */
  sha256File(path: string): Promise<string>;
}

export default requireNativeModule<SovereignHashingModule>('SovereignHashing');
