/** Counts significant digits of a JSON number's source text. */
function significantDigits(source: string): number {
  const mantissa = source.replace(/^-/, '').split(/[eE]/)[0] ?? '';
  const digits = mantissa.replace('.', '').replace(/^0+/, '');
  return (mantissa.includes('.') ? digits.replace(/0+$/, '') : digits).length;
}

type Reviver = (this: unknown, key: string, value: unknown, context?: { source?: string }) => unknown;

const lossless: Reviver = (_key, value, context) =>
  typeof value === 'number' && context?.source !== undefined && significantDigits(context.source) > 15 ? context.source : value;

/**
 * Parses JSON without losing decimal digits: a number with more than 15 significant digits is returned as its exact text
 * (where the runtime gives revivers the source text, Node >= 21; elsewhere it is a plain `JSON.parse`).
 */
export function parseJson(text: string): unknown {
  return JSON.parse(text, lossless as (key: string, value: unknown) => unknown);
}
