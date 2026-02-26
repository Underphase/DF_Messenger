import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { RegisterRepository } from './repositories/register.repository'
import { LoginRepository } from './repositories/login.repository'
import { AuthController } from './auth.controller'
import { MailModule } from '../mail/mail.module'
import { UserModule } from '../user/user.module'
import { CommonModule } from '../../utils/common.module'


@Module({
	imports: [MailModule, UserModule, CommonModule],
	controllers: [AuthController],
	providers: [AuthService, RegisterRepository, LoginRepository],
	exports: [AuthService, RegisterRepository, LoginRepository]
})

export class AuthModule {}