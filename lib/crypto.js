// lib/crypto.js
const crypto = require("crypto");

const SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY) throw new Error("SECRET_KEY env variable is not set");

/**
 * Derive a 32-byte AES key from the SECRET_KEY
 */
function getDerivedKey() {
  return crypto.scryptSync(SECRET_KEY, "streamvault-v1-salt", 32);
}

/**
 * Generate a cryptographically random token
 * Returns something like: a3f9b2c1d8e47a0b5c2d9e6f3a8b1c4d
 */
function generateToken(bytes = 20) {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Encrypt a URL string using AES-256-GCM
 * Returns base64url-safe string: iv.authTag.ciphertext
 */
function encryptUrl(url) {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack as base64url: iv(12) + authTag(16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64url");
}

/**
 * Decrypt an encrypted URL string
 */
function decryptUrl(encoded) {
  const packed = Buffer.from(encoded, "base64url");
  const iv = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);

  const key = getDerivedKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = { generateToken, encryptUrl, decryptUrl };
