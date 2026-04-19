import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// -- Sub-schemas (embedded) --

@Schema({ _id: false })
export class PremiumInfo {
  @Prop({ default: false })
  isPremium: boolean;

  @Prop()
  plan?: string;

  @Prop()
  expiresAt?: Date;

  @Prop()
  provider?: string; // 'revenuecat'

  @Prop()
  originalTransactionId?: string;
}

@Schema({ _id: false })
export class DeviceInformation {
  @Prop()
  deviceId?: string;

  @Prop()
  model?: string;

  @Prop()
  deviceModelName?: string;

  @Prop()
  systemName?: string;

  @Prop()
  systemVersion?: string;

  @Prop()
  appVersion?: string;

  @Prop()
  buildNumber?: string;

  @Prop()
  locale?: string;

  @Prop()
  timezone?: string;

  @Prop()
  screenSize?: string;

  @Prop()
  isSimulator?: boolean;

  @Prop()
  lastUpdated?: Date;
}

@Schema({ _id: false })
export class AppSettings {
  @Prop()
  theme?: string;

  @Prop()
  language?: string;

  @Prop()
  contentRating?: string;

  @Prop({ default: true })
  hapticFeedback?: boolean;

  @Prop({ default: true })
  animations?: boolean;

  @Prop({ default: true })
  highQualityImages?: boolean;

  @Prop({ type: Object })
  extra?: Record<string, any>; // iOS'tan gelen ek alanlar
}

@Schema({ _id: false })
export class NotificationSettings {
  @Prop({ default: true })
  friendRequests: boolean;

  @Prop({ default: true })
  multiplayerInvites: boolean;

  @Prop({ default: true })
  storyUpdates: boolean;
}

@Schema({ _id: false })
export class UserStats {
  @Prop({ default: 0 })
  storiesPlayed: number;

  @Prop({ default: 0 })
  storiesCompleted: number;

  @Prop({ default: 0 })
  multiplayerGamesPlayed: number;

  @Prop({ default: 0 })
  totalPlayTimeMinutes: number;
}

// -- Main User Schema --

@Schema({ timestamps: true, collection: 'users' })
export class User extends Document {
  @Prop({ required: true, unique: true, index: true })
  deviceId: string;

  @Prop()
  email?: string;

  @Prop()
  displayName?: string;

  @Prop()
  photoURL?: string;

  @Prop()
  photoThumbnailURL?: string;

  @Prop({ default: true })
  isAnonymous: boolean;

  @Prop()
  phoneNumber?: string;

  @Prop({ sparse: true, unique: true, index: true })
  userHandle?: string;

  @Prop({ type: PremiumInfo, default: () => ({}) })
  premium: PremiumInfo;

  @Prop({ type: DeviceInformation })
  deviceInfo?: DeviceInformation;

  @Prop({ type: NotificationSettings, default: () => ({}) })
  notificationSettings: NotificationSettings;

  @Prop({ type: AppSettings })
  appSettings?: AppSettings;

  @Prop({ default: 0 })
  credits: number;

  @Prop({ default: false })
  isFake: boolean;

  @Prop({ default: false })
  online: boolean;

  @Prop()
  lastSeen?: Date;

  @Prop()
  presenceUpdatedAt?: Date;

  @Prop()
  referredBy?: string;

  @Prop()
  appsflyer_id?: string;

  @Prop({ type: UserStats, default: () => ({}) })
  userStats: UserStats;

  @Prop()
  legacyFirebaseId?: string; // Geçiş dönemi — eski Firebase UID

  @Prop()
  oneSignalPlayerId?: string;

  // -- Moderation / lifecycle --

  @Prop({ default: false })
  isBanned: boolean;

  @Prop()
  bannedAt?: Date;

  @Prop()
  banReason?: string;

  @Prop()
  bannedUntil?: Date; // null = permanent

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop()
  anonymizedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Compound indexes
UserSchema.index({ isFake: 1 });
UserSchema.index({ 'premium.isPremium': 1 });
UserSchema.index({ online: 1, lastSeen: -1 });
UserSchema.index({ legacyFirebaseId: 1 }, { sparse: true });
UserSchema.index({ isBanned: 1 });
UserSchema.index({ isDeleted: 1 });
