import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Cédula ecuatoriana válida (algoritmo módulo 10) para no chocar con el
// validador @IsCedula del DTO de registro. provincia fija (17 = Pichincha),
// tercer dígito 0 (persona natural), resto derivado de un sufijo único.
function generateValidCedula(uniqueSuffix: string): string {
  const digits = ('17' + '0' + uniqueSuffix.padStart(6, '0').slice(-6)).split('').map(Number);
  const coeff = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = digits[i] * coeff[i];
    if (v > 9) v -= 9;
    sum += v;
  }
  const check = sum % 10 === 0 ? 0 : 10 - (sum % 10);
  return digits.join('') + check;
}

// Prueba end-to-end de la funcionalidad de sesión única por cuenta: un login
// desde un "segundo dispositivo" debe invalidar de inmediato el token del
// primero. Corre contra la app Nest real (guards, JwtStrategy, DB) — no
// mocks — sobre la base de datos LOCAL de desarrollo (docker taxi-db), que
// solo contiene datos de prueba.
describe('Auth — sesión única por cuenta (e2e)', () => {
  let app: INestApplication;
  const uniqueSuffix = Date.now().toString().slice(-6);
  const phone = `+59399${uniqueSuffix}`;
  const cedula = generateValidCedula(uniqueSuffix);
  const password = 'TestE2E123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a client, logs in from two devices, and revokes the first session', async () => {
    const server = app.getHttpServer();

    // 1. Versión vigente de términos para clientes
    const termsRes = await request(server).get('/terms/client').expect(200);
    const termsVersion = termsRes.body.version;
    expect(termsVersion).toBeDefined();

    // 2. Registro
    await request(server)
      .post('/auth/register/client')
      .send({
        phone,
        full_name: 'E2E Test User',
        cedula,
        terms_version: termsVersion,
        password,
      })
      .expect(201);

    // 3. Login "dispositivo A" (bypass de OTP disponible solo en dev)
    const loginA = await request(server)
      .post('/auth/otp/verify')
      .send({ phone, code: '000000' })
      .expect(201);
    const tokenA = loginA.body.access_token;
    expect(tokenA).toBeDefined();

    // 4. El token A funciona
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // 5. Login "dispositivo B" — mismo número, nuevo login
    const loginB = await request(server)
      .post('/auth/otp/verify')
      .send({ phone, code: '000000' })
      .expect(201);
    const tokenB = loginB.body.access_token;
    expect(tokenB).toBeDefined();
    expect(tokenB).not.toBe(tokenA);

    // 6. El token A (dispositivo viejo) queda invalidado de inmediato
    const rejectedA = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(401);
    expect(rejectedA.body.message).toMatch(/otro dispositivo/i);

    // 7. El token B (dispositivo nuevo) sigue funcionando
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
  });
});
