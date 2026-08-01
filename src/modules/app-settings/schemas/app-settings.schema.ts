import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'app_settings' })
export class AppSettingsDoc extends Document {
  @Prop({ default: 'global' })
  key: string;

  @Prop({ default: 50 })
  defaultCredits: number;

  @Prop({ default: true })
  fakeMatch: boolean;

  @Prop({ default: 10 })
  fakeMatchTimeSeconds: number;

  @Prop({ default: 3 })
  referralDailyLimit: number;

  @Prop({ default: 50 })
  referralBonusCredits: number;

  @Prop({ default: true })
  censorshipEnabled: boolean;

  /**
   * Multiplayer serbest metin (custom input) tur maliyeti.
   * Sunucu `POST /api/credits/spend` fiyatını buradan okur — istemcinin gönderdiği
   * `amount` yok sayılır. iOS `AppSettingsRemoteManager` varsayılanı da 10.
   */
  @Prop({ default: 10 })
  customInputCreditCost: number;

  @Prop({ type: Object })
  extra?: Record<string, any>;
}

export const AppSettingsDocSchema = SchemaFactory.createForClass(AppSettingsDoc);
