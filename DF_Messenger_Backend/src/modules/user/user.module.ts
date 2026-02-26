import { Module } from '@nestjs/common'
import { MinioService } from '../../db/minio/minio.service'
import { CommonService } from '../../utils/common.service'
import { MailService } from '../mail/mail.service'
import { UserController } from './controllers/user.controller'
import { ProfileRepository } from './repositories/profile.repository'
import { RefreshTokenRepository } from './repositories/refreshToken.repository'
import { UserRepository } from './repositories/user.repository'
import { UserService } from './services/user.service'
import { FriendRepository } from './repositories/friend.repository'
import { FriendController } from './controllers/friend.controller'
import { FriendService } from './services/friend.service'

@Module({
	exports: [UserRepository, RefreshTokenRepository, UserService, FriendService],
	providers: [UserRepository, RefreshTokenRepository, UserService, CommonService, MinioService, MailService, ProfileRepository, FriendRepository, FriendService],
	controllers: [UserController, FriendController]
})
export class UserModule { }