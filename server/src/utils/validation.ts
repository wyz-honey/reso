import { UUID_RE } from '~/config/constants.ts';

export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}
