import { Module } from '@nestjs/common';
import { UserHandlesController } from './user-handles.controller';
import { UserHandlesService } from './user-handles.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [UserHandlesController],
  providers: [UserHandlesService],
})
export class UserHandlesModule {}
