import { router } from 'expo-router';

/** A match's next step: find them, or, once found, choose whether to swap contacts. */
export function openMatch(token: string, found: boolean) {
  router.push({ pathname: found ? '/decide/[token]' : '/find/[token]', params: { token } });
}
