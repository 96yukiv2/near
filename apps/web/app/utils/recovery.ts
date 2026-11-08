import { bytesToHex, recoverMessageAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

export function createRecoveryCode(): Hex {
  return generatePrivateKey();
}

export async function createSignInProof(
  code: string,
  origin: string,
  now = new Date(),
) {
  const normalized = code.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized))
    throw new Error("invalid_recovery_code");
  const parsed = new URL(origin);
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
  )
    throw new Error("secure_origin_required");
  const account = privateKeyToAccount(normalized as Hex);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const message = createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: parsed.host,
    nonce: bytesToHex(nonceBytes).slice(2),
    uri: `${parsed.origin}/account`,
    version: "1",
    issuedAt: now,
    notBefore: new Date(now.getTime() - 5_000),
    expirationTime: new Date(now.getTime() + 2 * 60_000),
  });
  const signature = await account.signMessage({ message });
  return { chain: "ethereum" as const, message, signature };
}

export async function getProofAddress(message: string, signature: Hex) {
  return recoverMessageAddress({ message, signature });
}
