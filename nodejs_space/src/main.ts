import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0f766e"/><path d="M14 7h4v7h7v4h-7v7h-4v-7H7v-4h7z" fill="#fff"/></svg>');

const CSS = `
body{background:#f7f9fb}
.swagger-ui{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2933}
.swagger-ui .info .title{color:#0f3d3a;font-weight:700}
.swagger-ui .info p,.swagger-ui .info li{color:#323f4b}
.swagger-ui .opblock{border-radius:8px;box-shadow:none}
.swagger-ui .opblock-tag{color:#1f2933;border-bottom:1px solid #d9e2ec}
.swagger-ui .btn.authorize{color:#0f766e;border-color:#0f766e}
.swagger-ui .btn.authorize svg{fill:#0f766e}
.swagger-ui .scheme-container{background:#fff;box-shadow:none;border-bottom:1px solid #e4e7eb}
`;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('WA Bot Rawat Inap API')
    .setDescription(
      'API WhatsApp Bot untuk alert Resume Medis & Surat Kontrol pasien rawat inap.\n\n' +
        'Endpoint bertanda gembok memerlukan header **x-api-key** (nilai ADMIN_API_KEY). Klik **Authorize** untuk mengisi.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const swaggerPath = 'api-docs';
  app.use(`/${swaggerPath}`, (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });
  SwaggerModule.setup(swaggerPath, app, document, {
    customSiteTitle: 'WA Bot Rawat Inap API',
    customfavIcon: FAVICON,
    customCss: CSS,
    swaggerOptions: { layout: 'BaseLayout', persistAuthorization: true },
  });

  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`Service berjalan di port ${process.env.PORT ?? 3000} — dokumentasi API: /api-docs`, 'Bootstrap');
}
bootstrap();
