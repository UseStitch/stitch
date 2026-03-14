export type PrefixedString<P extends string> = `${P}${string}`;

export const ID_PREFIXES = {
  session: "ses",
  message: "msg",
} as const;

let lastTimestamp = 0;
let counter = 0;

function randomBase62(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % 62];
  }
  return result;
}

export function createSessionId(): PrefixedString<"ses"> {
  return createId(ID_PREFIXES.session);
}

export function createMessageId(): PrefixedString<"msg"> {
  return createId(ID_PREFIXES.message);
}

function createId<
  P extends (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES],
>(prefix: P): PrefixedString<P> {
  const currentTimestamp = Date.now();

  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp;
    counter = 0;
  }
  counter++;

  const now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter);

  const timeBytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff));
  }

  const hexPart = Array.from(timeBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return (prefix + "_" + hexPart + randomBase62(14)) as PrefixedString<P>;
}

export function extractTimestamp(id: string): number {
  const prefix = id.split("_")[0];
  const hex = id.slice(prefix.length + 1, prefix.length + 13);
  const encoded = BigInt("0x" + hex);
  return Number(encoded / BigInt(0x1000));
}
