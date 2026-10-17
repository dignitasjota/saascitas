import { ValidateBy, ValidationOptions } from 'class-validator';

/** True if `value` is an IANA timezone the runtime's ICU data knows. */
export function isValidTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * IANA timezone (e.g. "Europe/Madrid"). The tenant timezone feeds every
 * Intl.DateTimeFormat call (availability, booking, emails, CSV); an invalid
 * one makes them throw RangeError and breaks the tenant with 500s.
 */
export function IsTimeZone(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isTimeZone',
      validator: {
        validate: (value) => isValidTimeZone(value),
        defaultMessage: () =>
          'timezone must be a valid IANA timezone (e.g. "Europe/Madrid")',
      },
    },
    validationOptions,
  );
}
