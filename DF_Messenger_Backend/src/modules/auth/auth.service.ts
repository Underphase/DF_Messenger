import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { RedisService } from '../../db/redis/redis.service'
import { MailService } from '../mail/mail.service'
import { userLoginDto, userRegisterDto, userSendCodeDto, userVerifyDto } from './dto/common.dto'
import { RegisterRepository } from './repositories/register.repository'

import bcrypt from 'bcrypt'
import { createHash } from 'crypto'
import { CommonService } from '../../utils/common.service'
import { RefreshTokenRepository } from '../user/repositories/refreshToken.repository'
import { UserRepository } from '../user/repositories/user.repository'
import { LoginRepository } from './repositories/login.repository'


@Injectable()
export class AuthService {
	constructor(
		private redis: RedisService,
		private mail: MailService,
		private registerRepo: RegisterRepository,
		private loginRepo: LoginRepository,
		private userRepo: UserRepository,
		private commonUtils: CommonService,
		private refreshTokenRepo: RefreshTokenRepository
	) { }

	async registerUser(dto: userRegisterDto) {

		const existingUser = await this.userRepo.getUserFromMail(dto.email)

		if (existingUser) {
			if (existingUser.isVerified) {
				throw new ConflictException('Email уже занят и верифицирован')
			}
			await this.userRepo.delUser(existingUser.id)
			if (await this.redis.CheckTTLKey(`${existingUser.email}:${existingUser.username}`)) {
				await this.redis.delTemporaryCode(existingUser.email, existingUser.username)
			}
		}

		const hashedPass = await bcrypt.hash(dto.password, 10)

		const user = await this.registerRepo.createUser(dto.email, dto.nickName, hashedPass)
		const code = await this.redis.generateTemporaryCode(user.email, user.username, 60)
		await this.mail.sendEmail('DF-Messenger', user.email, 'Ваш код для регистраций в приложений', code)

		return {
			message: "Код отправлен",
			email: user.email,
			expiresIn: 60
		}
	}

	async verifyUser(dto: userVerifyDto) {
		const user = await this.userRepo.getUserFromMail(dto.email)
		if (!user) {
			throw new UnauthorizedException('Пользователь не найден')
		}

		const isConfirmCode = await this.redis.confirmTemporaryCode(user.email, user.username, dto.code)

		if (isConfirmCode) {
			await this.userRepo.verifyUser(user.id)
			const tokens = await this.commonUtils.generateTokens(user)
			const hashRefreshToken = createHash('sha256').update(tokens.refreshToken).digest('hex')

			await this.refreshTokenRepo.createRefreshToken(user.id, hashRefreshToken, tokens.expiresAtRefreshToken)

			return tokens
		} else {
			throw new UnauthorizedException('Неправильно введённый код!')
		}
	}

	async loginUser(dto: userLoginDto) {
		const user = await this.loginRepo.loginUser(dto.email)
		if (!user) {
			throw new UnauthorizedException('Пользователь не найден')
		}
		const compare = await bcrypt.compare(dto.password, user.password)
		if (!compare) {
			throw new UnauthorizedException('Неправильный пароль!')
		}
		const code = await this.redis.generateTemporaryCode(user.email, user.username, 60)
		await this.mail.sendEmail('DF-Messenger', user.email, 'Ваш код для входа в приложение', code)

		return {
			message: "Код отправлен",
			email: user.email,
			expiresIn: 60
		}
	}

	async sendVerifyCode(dto: userSendCodeDto) {
		const user = await this.userRepo.getUserFromMail(dto.email)
		if (!user) {
			throw new UnauthorizedException('Пользователь не найден')
		}

		if (user.isVerified === false) {
			await this.redis.delTemporaryCode(user.email, user.username)
			const code = await this.redis.generateTemporaryCode(user.email, user.username, 60)

			await this.mail.sendEmail('DF-Messenger', user.email, 'Ваш код', code)
			return {
				message: "Код отправлен",
				email: user.email,
				expiresIn: 60
			}
		} else {
			throw new ConflictException('Аккаунт уже существует')
		}
	}

}