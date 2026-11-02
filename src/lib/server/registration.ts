import { env } from '$env/dynamic/public';

export function registrationAllowed(): boolean {
  return env.PUBLIC_ALLOW_REGISTRATION === 'true';
}
