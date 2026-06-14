/* eslint-disable no-console */
/**
 * One-shot dev: setea la contraseña de usuarios puntuales (bcrypt con los
 * rounds configurados) y revoca sus refresh tokens activos para forzar
 * re-login. Uso: pnpm exec tsx prisma/set-passwords.ts
 */
import bcrypt from 'bcrypt';

import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const NUEVA_PASSWORD = '12345';
const EMAILS = ['faldama@smashed.com.py', 'pruebacaja@smashed.com.py', 'elena@smashed.com.py'];

const passwordHash = await bcrypt.hash(NUEVA_PASSWORD, env.BCRYPT_ROUNDS);

for (const email of EMAILS) {
  const usuarios = await prisma.usuario.findMany({ where: { email } });
  if (usuarios.length === 0) {
    console.log(`[SKIP] no existe usuario con email ${email}`);
    continue;
  }
  const res = await prisma.usuario.updateMany({
    where: { email },
    data: { passwordHash },
  });
  await prisma.refreshToken.updateMany({
    where: { usuarioId: { in: usuarios.map((u) => u.id) }, revocadoEn: null },
    data: { revocadoEn: new Date() },
  });
  console.log(`[OK] ${email}: ${res.count} usuario(s) actualizado(s)`);
}

await prisma.$disconnect();
