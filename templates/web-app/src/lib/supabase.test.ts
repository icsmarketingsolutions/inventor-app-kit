import { describe, expect, it } from 'vitest';
import { isAllowedSupabaseUrl } from './supabase';

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
