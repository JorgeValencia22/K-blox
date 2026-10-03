// Hash de contraseñas con scrypt (crypto integrado) y utilidades de tokens.
import crypto from 'node:crypto';

const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, KEYLEN, PARAMS, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${PARAMS.N}$${salt.toString('base64')}$${key.toString('base64')}`);
    });
  });
}

export function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored).split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') return resolve(false);
    const salt = Buffer.from(parts[2], 'base64');
    const expected = Buffer.from(parts[3], 'base64');
    crypto.scrypt(password, salt, expected.length, { ...PARAMS, N: parseInt(parts[1], 10) }, (err, key) => {
      if (err) return resolve(false);
      resolve(crypto.timingSafeEqual(key, expected));
    });
  });
}

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export const newId = () => crypto.randomUUID();
export const inviteCode = () => crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
