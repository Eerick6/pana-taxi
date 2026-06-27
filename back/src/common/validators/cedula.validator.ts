import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsCedula(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCedula',
      target: object.constructor,
      propertyName,
      options: { message: 'Cédula ecuatoriana inválida', ...validationOptions },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || !/^\d{10}$/.test(value)) return false;
          const province = parseInt(value.substring(0, 2), 10);
          if (province < 1 || province > 24) return false;
          if (parseInt(value[2], 10) >= 6) return false;
          const coeff = [2, 1, 2, 1, 2, 1, 2, 1, 2];
          let sum = 0;
          for (let i = 0; i < 9; i++) {
            let v = parseInt(value[i], 10) * coeff[i];
            if (v > 9) v -= 9;
            sum += v;
          }
          const check = sum % 10 === 0 ? 0 : 10 - (sum % 10);
          return check === parseInt(value[9], 10);
        },
      },
    });
  };
}
