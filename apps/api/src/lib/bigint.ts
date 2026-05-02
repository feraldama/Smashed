/**
 * Patch global de BigInt para serialización JSON.
 * Sin este patch, `JSON.stringify(123n)` lanza TypeError.
 *
 * Convertimos BigInt a string para preservar precisión exacta en transit
 * (los guaraníes son enteros pequeños pero futuro-proof).
 *
 * Importar este archivo UNA VEZ en el bootstrap antes de manejar requests.
 */

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (typeof BigInt.prototype.toJSON !== 'function') {
   
  BigInt.prototype.toJSON = function toJSON() {
    return this.toString();
  };
}

export {};
