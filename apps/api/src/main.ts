import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";

@Controller()
class HealthController {
  @Get("health") health(): { status: "ok"; service: "api" } {
    return { status: "ok", service: "api" };
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" });
}

void bootstrap();
