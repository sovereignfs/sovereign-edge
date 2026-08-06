package expo.modules.sovereignhashing

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class FileNotReadableException(path: String, cause: Throwable? = null) :
  CodedException("ERR_FILE_NOT_READABLE", "Cannot read file at $path", cause)

/**
 * Streaming SHA-256 over a file path.
 *
 * Exists because `expo-file-system` hashes MD5 natively but SHA-256 only in
 * JavaScript, which measured 1.1 MB/s on device — roughly an hour for a 4 GB
 * model. Model publishers publish SHA-256 and never MD5, so without this the
 * app cannot check a model against the digest its author actually vouches
 * for. See research 0003.
 *
 * Read in chunks rather than whole: these are multi-gigabyte files, and
 * loading one into memory on a phone is its own failure mode.
 */
class SovereignHashingModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SovereignHashing")

    AsyncFunction("sha256File") { path: String ->
      val file = File(path.removePrefix("file://"))
      if (!file.isFile || !file.canRead()) {
        throw FileNotReadableException(path)
      }

      try {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(BUFFER_BYTES)

        FileInputStream(file).use { stream ->
          while (true) {
            val read = stream.read(buffer)
            if (read <= 0) break
            digest.update(buffer, 0, read)
          }
        }

        digest.digest().joinToString("") { "%02x".format(it) }
      } catch (cause: Throwable) {
        throw FileNotReadableException(path, cause)
      }
    }
  }

  private companion object {
    /**
     * 1 MB. Large enough that syscall overhead is negligible, small enough
     * that the buffer is never itself the memory problem.
     */
    const val BUFFER_BYTES = 1024 * 1024
  }
}
