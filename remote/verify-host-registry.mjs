#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createPublicKey, verify } from "node:crypto";

const [registryPath, signaturePath, publicKeyPath, expectedVersion = "0.30.0"] = process.argv.slice(2);
if (!registryPath || !signaturePath || !publicKeyPath) {
  throw new Error("Usage: verify-host-registry.mjs REGISTRY SIGNATURE PUBLIC_KEY");
}
const [registryBytes, signatureText, publicKeyPem] = await Promise.all([
  readFile(registryPath),
  readFile(signaturePath, "utf8"),
  readFile(publicKeyPath),
]);
if (registryBytes.length > 256 * 1024) {
  throw new Error("Host registry is too large");
}
const signatureValue = signatureText.trim();
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureValue)) {
  throw new Error("Host registry signature is not valid base64");
}
const signature = Buffer.from(signatureValue, "base64");
const publicKey = createPublicKey(publicKeyPem);
if (!verify(null, registryBytes, publicKey, signature)) {
  throw new Error("Host registry signature verification failed");
}
const registry = JSON.parse(registryBytes.toString("utf8"));
if (registry.schemaVersion !== 1 || registry.grokBotVersion !== expectedVersion) {
  throw new Error("Host registry targets an unsupported schema or Grok Bot version");
}
if (!Array.isArray(registry.stockHosts) || registry.stockHosts.length === 0) {
  throw new Error("Host registry has no stockHosts entries");
}
const seen = new Set();
for (const entry of registry.stockHosts) {
  if (!entry || !/^[0-9a-f]{64}$/.test(entry.sha256 || "")) {
    throw new Error("Host registry contains an invalid SHA-256");
  }
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) {
    throw new Error("Host registry contains an invalid byte count");
  }
  if (seen.has(entry.sha256)) throw new Error("Host registry contains a duplicate SHA-256");
  seen.add(entry.sha256);
}
process.stdout.write("HOST_REGISTRY_VERIFIED\n");
