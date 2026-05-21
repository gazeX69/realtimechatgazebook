import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NextFunction, Request, Response } from 'express';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const reflector = app.get(Reflector);
  const configuredOrigins = config
    .getOrThrow<string>('app.corsOriginList')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const isAllowedOrigin = (origin?: string) => {
    if (!origin) return true;
    const normalized = origin.replace(/\/$/, '');
    return configuredOrigins.includes(normalized) || normalized.includes('localhost') || normalized.endsWith('.ngrok-free.app');
  };

  app.setGlobalPrefix(config.getOrThrow<string>('app.apiPrefix'));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
      res.header('Access-Control-Allow-Origin', origin || configuredOrigins[0] || 'http://localhost:5173');
    }
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, ngrok-skip-browser-warning',
  });
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector), new ResponseInterceptor());

  await app.listen(config.getOrThrow<number>('app.port'));
}

void bootstrap();
