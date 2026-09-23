import { z } from 'zod';

import type { JsonObject } from '@stitch/shared/json';

import type { ToolTypeInfo } from '@/code-mode/bindings/tool-binding.js';

const StringSchema = z.string();

function isString(value: unknown): value is string {
  return StringSchema.safeParse(value).success;
}

function jsonSchemaToTypeScript(schema: JsonObject, indent = 0): string {
  const pad = '  '.repeat(indent);

  const anyOf = schema['anyOf'] ?? schema['oneOf'];
  if (Array.isArray(anyOf)) {
    return (anyOf as JsonObject[]).map((s) => jsonSchemaToTypeScript(s, indent)).join(' | ');
  }

  const type = schema['type'];
  if (Array.isArray(type)) {
    return (type as string[]).map((t) => jsonSchemaToTypeScript({ ...schema, type: t }, indent)).join(' | ');
  }

  const enumValues = schema['enum'];
  if (Array.isArray(enumValues)) {
    return enumValues.map((value) => (isString(value) ? `"${value}"` : JSON.stringify(value))).join(' | ');
  }

  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array': {
      const items = schema['items'] as JsonObject | undefined;
      const itemType = items ? jsonSchemaToTypeScript(items, indent) : 'unknown';
      return `${itemType}[]`;
    }
    case 'object': {
      const properties = schema['properties'] as Record<string, JsonObject> | undefined;
      const required = new Set<string>(Array.isArray(schema['required']) ? (schema['required'] as string[]) : []);
      const additionalProperties = schema['additionalProperties'];

      if (!properties || Object.keys(properties).length === 0) {
        if (additionalProperties === false) return '{}';
        return 'Record<string, unknown>';
      }

      const lines: string[] = ['{'];
      for (const [key, propSchema] of Object.entries(properties)) {
        const optional = !required.has(key) ? '?' : '';
        const description = propSchema['description'];
        if (isString(description)) {
          lines.push(`${pad}  /** ${description} */`);
        }
        const propType = jsonSchemaToTypeScript(propSchema, indent + 1);
        lines.push(`${pad}  ${key}${optional}: ${propType};`);
      }
      lines.push(`${pad}}`);
      return lines.join('\n');
    }
    default:
      if (schema['properties']) {
        return jsonSchemaToTypeScript({ ...schema, type: 'object' }, indent);
      }
      return 'unknown';
  }
}

export function generateTypeStubs(bindings: Record<string, ToolTypeInfo>): string {
  const lines: string[] = [];

  for (const [name, binding] of Object.entries(bindings)) {
    const inputTypeName = `${toPascalCase(name)}Input`;
    const inputSchema = binding.inputSchema as JsonObject;

    const inputType = jsonSchemaToTypeScript(inputSchema);
    lines.push(`type ${inputTypeName} = ${inputType};`);
    lines.push('');

    if (binding.description) {
      lines.push(`/** ${binding.description} */`);
    }
    lines.push(`declare function ${name}(input: ${inputTypeName}): Promise<unknown>;`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function toPascalCase(name: string): string {
  return name
    .split(/[_\-\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
