import { env } from '$env/dynamic/public';
import db from './db';

export type RegistrationMode = 'open' | 'closed' | 'default';

export function registrationMode(): RegistrationMode {
  try {
    const row = db
      .prepare("SELECT value FROM instance_settings WHERE key = 'registration'")
      .get() as { value: string } | undefined;
    if (row?.value === 'open' || row?.value === 'closed') return row.value;
  } catch {
    // Settings table is created by migrate(); before that, fall back to the environment.
  }
  return 'default';
}

export function registrationAllowed(): boolean {
  const mode = registrationMode();
  if (mode !== 'default') return mode === 'open';
  return env.PUBLIC_ALLOW_REGISTRATION === 'true';
}

export function setRegistrationMode(mode: RegistrationMode): void {
  if (mode === 'default') {
    db.prepare("DELETE FROM instance_settings WHERE key = 'registration'").run();
    return;
  }
  db.prepare(
    "INSERT INTO instance_settings (key, value) VALUES ('registration', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(mode);
}
