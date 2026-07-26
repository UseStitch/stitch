import type { StandardSchemaV1Issue } from '@tanstack/react-form';

type FieldMeta = { isTouched: boolean; errors: readonly (StandardSchemaV1Issue | undefined)[] };

/**
 * Errors are populated on mount by the `onMount` validator, so they are only surfaced once the
 * user has interacted with the field. Submitting marks every field as touched.
 */
export function fieldErrorMessage(meta: FieldMeta): string | undefined {
  if (!meta.isTouched) return undefined;
  return meta.errors.find((issue) => issue?.message)?.message;
}

export function FieldError({ meta }: { meta: FieldMeta }) {
  const message = fieldErrorMessage(meta);
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
