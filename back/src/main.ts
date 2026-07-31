import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import helmet from 'helmet';
import { AppModule } from './app.module';

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Asegurar que el directorio exista antes de servir
  mkdirSync(UPLOADS_DIR, { recursive: true });

  // Servir archivos estáticos en GET /static/*
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/static' });

  app.use(helmet());

  const isDev = process.env.NODE_ENV !== 'production';
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? [];

  app.enableCors({
    origin: isDev ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
