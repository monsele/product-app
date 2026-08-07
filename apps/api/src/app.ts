import "reflect-metadata";
import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { getCorrelationId, PublicError } from "@avlp/config";
import type { DatabaseConnection } from "@avlp/database";
import { ApiExceptionFilter } from "./error-filter.js";

const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");
type ApiDatabaseConnection = Pick<DatabaseConnection, "healthCheck" | "close">;

@Injectable()
class HealthService {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly database: ApiDatabaseConnection,
  ) {}

  public async check(): Promise<void> {
    try {
      await this.database.healthCheck();
    } catch {
      throw new PublicError(
        "internal_error",
        "The service is temporarily unavailable.",
        503,
        true,
      );
    }
  }
}

@Controller()
class HealthController {
  public constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get("health") async health(): Promise<{ status: "ok"; service: "api" }> {
    await this.healthService.check();
    return { status: "ok", service: "api" };
  }
}

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly database: ApiDatabaseConnection,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService, DatabaseShutdown],
})
class AppModule {}

const healthyDatabase: ApiDatabaseConnection = {
  healthCheck: () => Promise.resolve(),
  close: () => Promise.resolve(),
};

function createAppModule(database: ApiDatabaseConnection): DynamicModule {
  return {
    module: AppModule,
    providers: [{ provide: DATABASE_CONNECTION, useValue: database }],
  };
}

export type CreateAppOptions = { database?: ApiDatabaseConnection };

export async function createApp(
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    createAppModule(options.database ?? healthyDatabase),
    new FastifyAdapter({
      logger: {
        level: "info",
        redact: ["req.headers.authorization", "req.headers.cookie", "req.url"],
      },
    }),
    { logger: false },
  );
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", (request, reply, done) => {
      const correlationRequest = request as typeof request & {
        correlationId?: string;
      };
      const header = request.headers["x-correlation-id"];
      correlationRequest.correlationId = getCorrelationId(
        Array.isArray(header) ? header[0] : header,
      );
      reply.header("x-correlation-id", correlationRequest.correlationId);
      request.log.info(
        { correlationId: correlationRequest.correlationId },
        "api_request_received",
      );
      done();
    });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}
