import { createClient } from '@supabase/supabase-js';
import project from '../project.generated.json';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export function isAllowedSupabaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === 'https:') return true;
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    return parsed.protocol === 'http:' && localHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(
  url
  && publishableKey
  && !publishableKey.startsWith('<')
  && isAllowedSupabaseUrl(url),
);

export function getSupabaseStorageKey(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('El slug no es válido para aislar la sesión local.');
  }
  return `inventor-${slug}-auth`;
}

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: getSupabaseStorageKey(project.slug),
      },
    })
  : null;
