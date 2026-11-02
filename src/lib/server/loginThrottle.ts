const attempts = new Map<string, { count: number; expires: number }>();
const WINDOW = 15 * 60 * 1000;

export function allowLogin(key: string, now = Date.now()): boolean {
  for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
  const entry = attempts.get(key) ?? { count: 0, expires: now + WINDOW };
  if (entry.count >= 10) return false;
  entry.count++;
  attempts.set(key, entry);
  return true;
}
