import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Friendship } from './schemas/friendship.schema';
import { FriendRequest } from './schemas/friend-request.schema';
import { FriendAlert } from './schemas/friend-alert.schema';

@Injectable()
export class FriendshipsService {
  constructor(
    @InjectModel(Friendship.name) private friendshipModel: Model<Friendship>,
    @InjectModel(FriendRequest.name) private requestModel: Model<FriendRequest>,
    @InjectModel(FriendAlert.name) private alertModel: Model<FriendAlert>,
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
    return this.friendshipModel.find({ members: new Types.ObjectId(userId) }).populate('members', 'displayName photoURL userHandle online lastSeen');
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
}
