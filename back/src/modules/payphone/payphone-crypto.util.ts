import * as crypto from 'crypto';

// Encriptación exigida por Payphone para el nombre del titular al cobrar
// con una tarjeta tokenizada (docs.payphone.app/tokenizacion, Fase 2):
// AES-256-CBC SIN vector de inicialización (IV en ceros). No es el mismo
// algoritmo que el resto del proyecto usa para datos propios (ver
// common/transformers/encrypt.transformer.ts, que es AES-256-GCM con IV
// aleatorio) — este es un requisito puntual de su API, no un estándar
// nuestro, hay que seguirlo tal cual para que Payphone pueda desencriptarlo.
//
// PAYPHONE_CODING_PASSWORD sale del panel de Payphone Developer, se obtiene
// junto con la aprobación de tokenización — no existe hasta que aprueben la
// cuenta. La derivación password → clave de 32 bytes no está especificada
// en su doc; se usa SHA-256 del password, el patrón más común para este
// tipo de integraciones. Si Payphone rechaza el cardHolder al cobrar,
// revisar esto primero contra su soporte.
const ALGORITHM = 'aes-256-cbc';
const ZERO_IV = Buffer.alloc(16, 0);

function getKey(): Buffer {
  const password = process.env.PAYPHONE_CODING_PASSWORD;
  if (!password) throw new Error('PAYPHONE_CODING_PASSWORD env var no definida');
  return crypto.createHash('sha256').update(password, 'utf8').digest();
}

export function encryptCardHolder(name: string): string {
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), ZERO_IV);
  const encrypted = Buffer.concat([cipher.update(name, 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
}
