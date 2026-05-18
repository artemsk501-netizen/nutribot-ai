import crypto from "node:crypto";

/**
 * Валидация Telegram.WebApp.initData (HMAC-SHA256).
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string): boolean {
  if (!initData) return false;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(calculatedHash, "hex"),
      Buffer.from(hash, "hex"),
    );
  } catch {
    return false;
  }
}

export function parseInitDataUser(initData: string): { id: number; first_name?: string } | null {
  const params = new URLSearchParams(initData);
  const userJson = params.get("user");
  if (!userJson) return null;

  try {
    const user = JSON.parse(userJson) as { id: number; first_name?: string };
    return user;
  } catch {
    return null;
  }
}
