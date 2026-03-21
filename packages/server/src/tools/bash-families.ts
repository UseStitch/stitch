import path from 'node:path';

import type { PermissionSuggestion } from '@stitch/shared/permissions/types';
import type { FamilyRule } from '@stitch/shared/tools/bash-families';
import { FAMILY_RULES } from '@stitch/shared/tools/bash-families';

type CommandFamily = {
  pattern: string;
  description: string;
};

function normalizeToken(token: string): string {
  let value = token.trim().toLowerCase();
  if (value.length === 0) return value;

  value = value.replace(/^['"]+|['"]+$/g, '');
  if (value.includes('/') || value.includes('\\')) {
    value = path.basename(value);
  }

  if (value.endsWith('.exe') || value.endsWith('.cmd') || value.endsWith('.bat')) {
    value = value.replace(/\.(exe|cmd|bat)$/i, '');
  }

  return value;
}

function splitCommands(command: string): string[] {
  const commands: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    const next = command[i + 1];

    if (quote === null && (char === '"' || char === "'")) {
      quote = char === '"' ? 'double' : 'single';
      current += char;
      continue;
    }

    if (quote === 'double' && char === '"') {
      quote = null;
      current += char;
      continue;
    }

    if (quote === 'single' && char === "'") {
      quote = null;
      current += char;
      continue;
    }

    if (quote === null) {
      const isDoubleOp = (char === '&' && next === '&') || (char === '|' && next === '|');
      if (isDoubleOp) {
        if (current.trim().length > 0) commands.push(current.trim());
        current = '';
        i += 1;
        continue;
      }

      if (char === ';' || char === '\n') {
        if (current.trim().length > 0) commands.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim().length > 0) commands.push(current.trim());
  return commands;
}

function splitTokens(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (quote === null && (char === '"' || char === "'")) {
      quote = char === '"' ? 'double' : 'single';
      continue;
    }

    if (quote === 'double' && char === '"') {
      quote = null;
      continue;
    }

    if (quote === 'single' && char === "'") {
      quote = null;
      continue;
    }

    if (quote === null && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function matchFamilyRule(tokens: string[]): FamilyRule | null {
  for (const rule of FAMILY_RULES) {
    if (tokens.length < rule.tokens.length) continue;
    const matches = rule.tokens.every((token, index) => tokens[index] === token);
    if (matches) return rule;
  }
  return null;
}

export function deriveCommandFamilies(command: string): CommandFamily[] {
  const families: CommandFamily[] = [];
  const seen = new Set<string>();

  for (const segment of splitCommands(command)) {
    const normalizedTokens = splitTokens(segment)
      .map((token) => normalizeToken(token))
      .filter((token) => token.length > 0);

    if (normalizedTokens.length === 0) continue;

    const rule = matchFamilyRule(normalizedTokens);
    if (!rule) continue;

    const arity = Math.max(1, Math.min(rule.arity, normalizedTokens.length));
    const familyPrefix = normalizedTokens.slice(0, arity).join(' ');
    const pattern = `${familyPrefix} *`;

    if (seen.has(pattern)) continue;
    seen.add(pattern);
    families.push({
      pattern,
      description: rule.description,
    });
  }

  return families;
}

export function getCommandFamilySuggestion(command: string): PermissionSuggestion | null {
  const firstFamily = deriveCommandFamilies(command)[0];
  if (!firstFamily) return null;

  return {
    message: `Always allow: ${firstFamily.description}`,
    pattern: firstFamily.pattern,
  };
}
