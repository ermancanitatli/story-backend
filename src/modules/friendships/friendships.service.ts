import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Friendship } from './schemas/friendship.schema';
import { FriendRequest } from './schemas/friend-request.schema';
import { FriendAlert } from './schemas/friend-alert.schema';
import { AppGateway } from '../socket/app.gateway';
import { UsersService } from '../users/users.service';

@Injectable()
export class FriendshipsService {
  constructor(
    @InjectModel(Friendship.name) private friendshipModel: Model<Friendship>,
    @InjectModel(FriendRequest.name) private requestModel: Model<FriendRequest>,
    @InjectModel(FriendAlert.name) private alertModel: Model<FriendAlert>,
    @Inject(forwardRef(() => AppGateway)) private appGateway: AppGateway,
    private usersService: UsersService,
  ) {}

  async sendRequest(fromUserId: string, toUserId: string): Promise<FriendRequest> {
    if (fromUserId === toUserId) throw new BadRequestException('Cannot send request to self');

    const existing = await this.requestModel.findOne({
      fromUserId: new Types.ObjectId(fromUserId),
      toUserId: new Types.ObjectId(toUserId),
      status: 'pending',
    });
    if (existing) throw new BadRequestException('Request already pending');

    const alreadyFriends = await this.friendshipModel.findOne({
      members: { $all: [new Types.ObjectId(fromUserId), new Types.ObjectId(toUserId)] },
    });
    if (alreadyFriends) throw new BadRequestException('Already friends');

    const request = await this.requestModel.create({
      fromUserId: new Types.ObjectId(fromUserId),
      toUserId: new Types.ObjectId(toUserId),
    });

    // Alert increment
    await this.alertModel.findOneAndUpdate(
      { userId: new Types.ObjectId(toUserId) },
      { $inc: { incomingPending: 1 } },
      { upsert: true },
    );

    // Realtime bildirim: alıcıya arkadaşlık isteği geldiğini haber ver
    this.appGateway.server.to(`user:${toUserId}`).emit('friend:request-received', { fromUserId });

    return request;
  }

  async acceptRequest(requestId: string, userId: string): Promise<Friendship> {
    const request = await this.requestModel.findById(requestId);
    if (!request || request.toUserId.toString() !== userId) throw new NotFoundException('Request not found');
    if (request.status !== 'pending') throw new BadRequestException('Request not pending');

    request.status = 'accepted';
    request.respondedAt = new Date();
    await request.save();

    const friendship = await this.friendshipModel.create({
      members: [request.fromUserId, request.toUserId],
    });

    // Update alerts
    await this.alertModel.findOneAndUpdate(
      { userId: request.toUserId },
      { $inc: { incomingPending: -1 } },
    );
    await this.alertModel.findOneAndUpdate(
      { userId: request.fromUserId },
      { $inc: { acceptedPending: 1 } },
      { upsert: true },
    );

    // Realtime bildirim: isteği gönderen kişiye kabul edildi bildir
    this.appGateway.server
      .to(`user:${request.fromUserId.toString()}`)
      .emit('friend:accepted', { friendshipId: friendship._id.toString() });

    return friendship;
  }

  async declineRequest(requestId: string, userId: string): Promise<void> {
    const request = await this.requestModel.findById(requestId);
    if (!request || request.toUserId.toString() !== userId) throw new NotFoundException();
    request.status = 'declined';
    request.respondedAt = new Date();
    await request.save();
    await this.alertModel.findOneAndUpdate({ userId: request.toUserId }, { $inc: { incomingPending: -1 } });
  }

  async getFriends(userId: string): Promise<Friendship[]> {
    return this.friendshipModel.find({ members: new Types.ObjectId(userId) }).populate('members', 'displayName photoURL photoThumbnailURL userHandle online lastSeen');
  }

  async getIncomingRequests(userId: string): Promise<FriendRequest[]> {
    return this.requestModel.find({ toUserId: new Types.ObjectId(userId), status: 'pending' }).sort({ createdAt: -1 });
  }

  async getAlerts(userId: string): Promise<FriendAlert | null> {
    return this.alertModel.findOne({ userId: new Types.ObjectId(userId) });
  }

  async removeFriend(userId: string, friendshipId: string): Promise<void> {
    const f = await this.friendshipModel.findById(friendshipId);
    if (!f || !f.members.some((m) => m.toString() === userId)) throw new NotFoundException();
    await f.deleteOne();
  }

  // MARK: - Invite by Handle

  /**
   * Davet linki üzerinden gelen kullanıcıyı handle bazında arkadaş olarak ekler ve otomatik kabul eder.
   * @param fromUserId  - Linke tıklayan (daveti kabul eden) kullanıcının ID'si
   * @param toUserHandle - Davet linkini paylaşan kullanıcının handle'ı
   */
  async acceptInviteByHandle(fromUserId: string, toUserHandle: string): Promise<Friendship> {
    // Handle'dan hedef kullanıcıyı bul
    const toUser = await this.usersService.findByHandle(toUserHandle);
    if (!toUser) throw new NotFoundException('Kullanıcı bulunamadı');

    const toUserId = (toUser._id as Types.ObjectId).toString();

    if (fromUserId === toUserId) throw new BadRequestException('Kendinize arkadaşlık isteği gönderemezsiniz');

    // Zaten arkadaş mı?
    const alreadyFriends = await this.friendshipModel.findOne({
      members: { $all: [new Types.ObjectId(fromUserId), new Types.ObjectId(toUserId)] },
    });
    if (alreadyFriends) return alreadyFriends;

    // Bekleyen istek var mı? (her iki yönde)
    const existingRequest = await this.requestModel.findOne({
      $or: [
        { fromUserId: new Types.ObjectId(fromUserId), toUserId: new Types.ObjectId(toUserId), status: 'pending' },
        { fromUserId: new Types.ObjectId(toUserId), toUserId: new Types.ObjectId(fromUserId), status: 'pending' },
      ],
    });

    if (existingRequest) {
      // Bekleyen istek varsa kabul et
      existingRequest.status = 'accepted';
      existingRequest.respondedAt = new Date();
      await existingRequest.save();

      const friendship = await this.friendshipModel.create({
        members: [existingRequest.fromUserId, existingRequest.toUserId],
      });

      // Alert güncellemeleri
      await this.alertModel.findOneAndUpdate(
        { userId: existingRequest.toUserId },
        { $inc: { incomingPending: -1 } },
      );
      await this.alertModel.findOneAndUpdate(
        { userId: existingRequest.fromUserId },
        { $inc: { acceptedPending: 1 } },
        { upsert: true },
      );

      // Realtime bildirim
      this.appGateway.server
        .to(`user:${existingRequest.fromUserId.toString()}`)
        .emit('friend:accepted', { friendshipId: friendship._id.toString() });

      return friendship;
    }

    // Yeni istek oluştur ve hemen kabul et
    const request = await this.requestModel.create({
      fromUserId: new Types.ObjectId(fromUserId),
      toUserId: new Types.ObjectId(toUserId),
      status: 'accepted',
      respondedAt: new Date(),
    });

    const friendship = await this.friendshipModel.create({
      members: [request.fromUserId, request.toUserId],
    });

    // Hedef kullanıcıya accepted bildir
    await this.alertModel.findOneAndUpdate(
      { userId: new Types.ObjectId(toUserId) },
      { $inc: { acceptedPending: 1 } },
      { upsert: true },
    );

    // Realtime bildirim her iki tarafa
    this.appGateway.server
      .to(`user:${toUserId}`)
      .emit('friend:accepted', { friendshipId: friendship._id.toString() });
    this.appGateway.server
      .to(`user:${fromUserId}`)
      .emit('friend:accepted', { friendshipId: friendship._id.toString() });

    return friendship;
  }

  /**
   * Handle'ın davet linki için geçerli olup olmadığını kontrol eder.
   */
  async validateInviteHandle(handle: string): Promise<{ valid: boolean; displayName?: string; photoURL?: string }> {
    const user = await this.usersService.findByHandle(handle);
    if (!user) return { valid: false };
    return {
      valid: true,
      displayName: user.displayName,
      photoURL: user.photoThumbnailURL ?? user.photoURL,
    };
  }
}
