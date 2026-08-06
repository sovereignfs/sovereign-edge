import CryptoKit
import ExpoModulesCore

internal final class FileNotReadableException: GenericException<String> {
  override var reason: String {
    "Cannot read file at \(param)"
  }
}

/**
 * Streaming SHA-256 over a file path.
 *
 * Exists because `expo-file-system` hashes MD5 natively but SHA-256 only in
 * JavaScript, which measured 1.1 MB/s on device — roughly an hour for a 4 GB
 * model. Model publishers publish SHA-256 and never MD5, so without this the
 * app cannot check a model against the digest its author actually vouches
 * for. See research 0003.
 */
public class SovereignHashingModule: Module {
  /// 1 MB. Large enough that syscall overhead is negligible, small enough
  /// that the buffer is never itself the memory problem.
  private static let bufferBytes = 1024 * 1024

  public func definition() -> ModuleDefinition {
    Name("SovereignHashing")

    AsyncFunction("sha256File") { (path: String) -> String in
      let cleaned = path.hasPrefix("file://")
        ? String(path.dropFirst("file://".count))
        : path

      guard let handle = FileHandle(forReadingAtPath: cleaned) else {
        throw FileNotReadableException(path)
      }
      defer { try? handle.close() }

      var hasher = SHA256()

      // Read in chunks rather than whole: these are multi-gigabyte files, and
      // loading one into memory on a phone is its own failure mode.
      while true {
        guard let chunk = try handle.read(upToCount: Self.bufferBytes),
              !chunk.isEmpty
        else { break }
        hasher.update(data: chunk)
      }

      return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
  }
}
