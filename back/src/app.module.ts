import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PlatformModule } from './modules/platform/platform.module';
import { CooperativesModule } from './modules/cooperatives/cooperatives.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { ClientsModule } from './modules/clients/clients.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { StorageModule } from './modules/storage/storage.module';
import { VehicleRequestsModule } from './modules/vehicle-requests/vehicle-requests.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { TermsModule } from './modules/terms/terms.module';
import { TripsModule } from './modules/trips/trips.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { FareModule } from './modules/fare/fare.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { StandsModule } from './modules/stands/stands.module';
import { SosModule } from './modules/sos/sos.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './modules/audit/audit.interceptor';
import { AccountingModule } from './modules/accounting/accounting.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'global', ttl: 60000, limit: 60 },
    ]),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'db',
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USER || 'taxi',
      password: process.env.DB_PASSWORD || 'taxi',
      database: process.env.DB_NAME || 'taxi',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    AuthModule,
    UsersModule,
    PlatformModule,
    CooperativesModule,
    DriversModule,
    VehiclesModule,
    ClientsModule,
    WalletModule,
    StorageModule,
    VehicleRequestsModule,
    RatingsModule,
    TermsModule,
    TripsModule,
    GatewayModule,
    FareModule,
    PaymentMethodsModule,
    StandsModule,
    SosModule,
    ReportsModule,
    NotificationsModule,
    AuditModule,
    AccountingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}

