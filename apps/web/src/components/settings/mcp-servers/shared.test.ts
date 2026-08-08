import { describe, expect, test } from 'bun:test';

import { EMPTY_ADD_FORM, addMcpServerSchema, applyAuthConfigToForm } from './shared.js';

import type { AddFormState } from './shared.js';

function form(overrides: Partial<AddFormState> = {}): AddFormState {
  return { ...EMPTY_ADD_FORM, name: 'Example', url: 'https://mcp.example.com', ...overrides };
}

describe('MCP server form validation', () => {
  test('validates the initial empty form synchronously', () => {
    const result = addMcpServerSchema['~standard'].validate(EMPTY_ADD_FORM);

    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toHaveProperty('issues');
  });

  test('accepts valid MCP server URLs regardless of protocol', () => {
    expect(addMcpServerSchema.safeParse(form({ url: 'http://localhost:3000/mcp' })).success).toBe(true);
    expect(addMcpServerSchema.safeParse(form({ url: 'https://mcp.example.com' })).success).toBe(true);
    expect(addMcpServerSchema.safeParse(form({ url: 'ftp://mcp.example.com' })).success).toBe(true);
    expect(addMcpServerSchema.safeParse(form({ url: 'file:///tmp/mcp' })).success).toBe(true);
    expect(addMcpServerSchema.safeParse(form({ url: 'not a URL' })).success).toBe(false);
  });

  test('requires credentials for API key and header authentication', () => {
    expect(addMcpServerSchema.safeParse(form({ authType: 'api_key', apiKey: '   ' })).success).toBe(false);
    expect(addMcpServerSchema.safeParse(form({ authType: 'api_key', apiKey: 'secret' })).success).toBe(true);
    expect(
      addMcpServerSchema.safeParse({
        ...form({ authType: 'headers' }),
        headers: [{ id: 'header', key: 'Authorization', value: '   ' }],
      }).success,
    ).toBe(false);
    expect(
      addMcpServerSchema.safeParse({
        ...form({ authType: 'headers' }),
        headers: [{ id: 'header', key: 'Authorization', value: 'Bearer secret' }],
      }).success,
    ).toBe(true);
  });
});

describe('registry auth presets', () => {
  test('clears credential placeholders while retaining header names', () => {
    const apiKeyForm = applyAuthConfigToForm(form(), { type: 'api_key', apiKey: 'YOUR_API_KEY' });
    const headersForm = applyAuthConfigToForm(form(), {
      type: 'headers',
      headers: { 'x-api-key': 'YOUR_EXA_API_KEY' },
    });

    expect(apiKeyForm.apiKey).toBe('');
    expect(headersForm.headers).toMatchObject([{ key: 'x-api-key', value: '' }]);
  });
});
