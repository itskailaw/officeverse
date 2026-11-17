import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM using INTEGRATION_ENCRYPTION_KEY (any long random string; hashed to 32 bytes). */
function key() {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k || k.length < 24) throw new Error("INTEGRATION_ENCRYPTION_KEY is missing or too short (use at least 32 random characters).");
  return createHash("sha256").update(k).digest();
}

/** Returns base64(iv | tag | ciphertext). */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function decrypt(b64: string) {
  const raw = Buffer.from(b64, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}
