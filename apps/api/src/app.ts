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
import { PublicError } from "@avlp/config";
import type { DatabaseConnection } from "@avlp/database";
import {
  correlationIdFromHeader,
  createStructuredLogger,
  withCorrelationContext,
  type StructuredLogger,
} from "@avlp/observability";
import { ApiExceptionFilter } from "./error-filter.js";

const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");
const TELEMETRY_SHUTDOWN = Symbol("TELEMETRY_SHUTDOWN");
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
    @Inject(TELEMETRY_SHUTDOWN)
    private readonly telemetryShutdown: () => Promise<void>,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.database.close();
    await this.telemetryShutdown();
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

function createAppModule(
  database: ApiDatabaseConnection,
  telemetryShutdown: () => Promise<void>,
): DynamicModule {
  return {
    module: AppModule,
    providers: [
      { provide: DATABASE_CONNECTION, useValue: database },
      { provide: TELEMETRY_SHUTDOWN, useValue: telemetryShutdown },
    ],
  };
}

export type CreateAppOptions = {
  database?: ApiDatabaseConnection;
  logger?: StructuredLogger;
  telemetryShutdown?: () => Promise<void>;
  configure?: (app: NestFastifyApplication) => void | Promise<void>;
};

export async function createApp(
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const logger = options.logger ?? createStructuredLogger({ service: "api" });
  const app = await NestFactory.create<NestFastifyApplication>(
    createAppModule(
      options.database ?? healthyDatabase,
      options.telemetryShutdown ?? (() => Promise.resolve()),
    ),
    new FastifyAdapter({
      logger: {
        level: "info",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers.x-api-key",
            "req.url",
            "req.body",
            "res.headers.set-cookie",
          ],
          censor: "[REDACTED]",
        },
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
      correlationRequest.correlationId = correlationIdFromHeader(header);
      reply.header("x-correlation-id", correlationRequest.correlationId);
      logger.info("api.request_received", {
        correlationId: correlationRequest.correlationId,
        method: request.method,
        route: request.routeOptions.url,
      });
      withCorrelationContext(
        { correlationId: correlationRequest.correlationId },
        done,
      );
    });
  app.useGlobalFilters(new ApiExceptionFilter());
  await options.configure?.(app);
  await app.init();
  return app;
}
