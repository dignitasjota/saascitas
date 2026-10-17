import {
  IsStrongPassword as IsStrongPasswordBase,
  ValidationOptions,
} from 'class-validator';

/**
 * Password policy for new/changed passwords: at least 8 characters with lower
 * case, upper case and a number (symbols not required, to avoid frustrating
 * users). Applied consistently across register / reset / change / create-user.
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return IsStrongPasswordBase(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 0,
    },
    {
      message:
        'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y números',
      ...validationOptions,
    },
  );
}
