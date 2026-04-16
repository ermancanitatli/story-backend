import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RevenueCatEvent, RevenueCatEventSchema } from './schemas/revenuecat-event.schema';
import { UsersModule } from '../users/users.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RevenueCatEvent.name, schema: RevenueCatEventSchema }]),
    UsersModule,
    CreditsModule,
  ],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
