import { describe, expect, it } from 'vitest';
import { getSupabaseStorageKey, isAllowedSupabaseUrl } from './supabase';

describe('isAllowedSupabaseUrl', () => {
  it('acepta HTTPS remoto y HTTP únicamente en loopback', () => {
    expect(isAllowedSupabaseUrl('https://example.supabase.co')).toBe(true);
    expect(isAllowedSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isAllowedSupabaseUrl('http://localhost:54321')).toBe(true);
    expect(isAllowedSupabaseUrl('http://[::1]:54321')).toBe(true);
  });

  it('rechaza HTTP remoto, credenciales embebidas y URLs inválidas', () => {
    expect(isAllowedSupabaseUrl('http://example.supabase.co')).toBe(false);
    const credentialUrl = ['https://', 'user', ':', 'password', '@example.supabase.co'].join('');
    expect(isAllowedSupabaseUrl(credentialUrl)).toBe(false);
    expect(isAllowedSupabaseUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedSupabaseUrl('no-es-url')).toBe(false);
  });
});

describe('getSupabaseStorageKey', () => {
  it('aísla sesiones de aplicaciones con slugs distintos', () => {
    expect(getSupabaseStorageKey('taller-uno')).not.toBe(getSupabaseStorageKey('taller-dos'));
    expect(getSupabaseStorageKey('taller-uno')).toBe('inventor-taller-uno-auth');
  });

  it('rechaza slugs que no pertenecen al generador', () => {
    expect(() => getSupabaseStorageKey('../otra-app')).toThrow(/slug/i);
  });
});
