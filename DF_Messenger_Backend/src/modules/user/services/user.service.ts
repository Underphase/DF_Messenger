import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import bcrypt from 'bcrypt'
import { createHash } from 'crypto'
import 'multer'
import { MinioService } from '../../../db/minio/minio.service'
import { RedisService } from '../../../db/redis/redis.service'
import { CommonService } from '../../../utils/common.service'
import { MailService } from '../../mail/mail.service'
import { changeEmailDto, changePasswordDto, confirmChangeEmailDto, confirmChangePasswordDto, getRefreshDto, profileUpdateDto } from '../dto/common.dto'
import { ProfileRepository } from '../repositories/profile.repository'
import { RefreshTokenRepository } from '../repositories/refreshToken.repository'
import { UserRepository } from '../repositories/user.repository'

@Injectable()
export class UserService {
	constructor(
		private refreshTokenRepo: RefreshTokenRepository,
		private commonUtils: CommonService,
		private userRepo: UserRepository,
		private minio: MinioService,
		private mail: MailService,
		private redis: RedisService,
		private profile: ProfileRepository
	) { }

	async verifyAndGiveRefreshToken(dto: getRefreshDto) {
		const hash = createHash('sha256').update(dto.oldRefreshToken).digest('hex')
		const isVerified = await this.refreshTokenRepo.verifyRefreshToken(hash)

		const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
		const rawToken = crypto.randomUUID()
		const hashedRefreshToken = createHash('sha256').update(rawToken).digest('hex')

		await this.refreshTokenRepo.createRefreshToken(isVerified.userId, hashedRefreshToken, expiresAt, hash, isVerified.familyId)
		const accessToken = await this.commonUtils.generateAccessToken({ id: isVerified.userId })

		return {
			refreshToken: rawToken,
			accessToken: accessToken
		}
	}

	async logout(dto: getRefreshDto) {
		const hash = createHash('sha256').update(dto.oldRefreshToken).digest('hex')
		const userToken = await this.refreshTokenRepo.verifyRefreshToken(hash)
		const result = await this.refreshTokenRepo.logoutUser(userToken.userId, userToken.familyId)
		return result
	}

	async getMe(userId: number) {
		return this.userRepo.getUserFromId(userId)
	}

	async profileUpdate(dto: profileUpdateDto, userId: number) {
		return this.profile.updateProfile(userId, dto.description, dto.nickName, dto.username)
	}

	async changeAvatar(userId: number, file: Express.Multer.File) {
		const key = `${userId}.${file.mimetype.split('/')[1]}`

		await this.minio.uploadFile(key, file.buffer, file.mimetype)
		await this.profile.saveUserAvatarUrl(userId, `${process.env.AVATARS_PATH}/${key}`)

		return {
			message: "Аватарка успешно изменена",
			avatarUrl: `${process.env.AVATARS_PATH}/${key}`
		}
	}

	async downloadAvatar(userId: number) {
		const user = await this.userRepo.getUserFromId(userId)
		if (!user.avatarUrl) throw new NotFoundException('Аватарка не найдена')

		const url = await this.minio.getPresignedUrl(user.avatarUrl)
		return { url }
	}

	async changeEmail(dto: changeEmailDto, userId: number) {
		const user = await this.userRepo.getUserFromId(userId)
		if (dto.oldEmail !== user.email) throw new ConflictException('Неверная почта!')
		const isEmailExist = await this.userRepo.getUserFromMail(dto.newEmail)
		if (isEmailExist) throw new ConflictException('Такая почта уже существует!')

		const code = await this.redis.generateTemporaryCode(dto.newEmail, user.username, 60)
		await this.mail.sendEmail('DF_Messenger', dto.newEmail, 'Код для смены почты', code)

		return {
			message: "Код для смены почты отправлен на вашу новую почту!"
		}
	}

	async confirmChangeEmail(dto: confirmChangeEmailDto, userId: number) {
		const user = await this.userRepo.getUserFromId(userId)
		if (await this.redis.confirmTemporaryCode(dto.newEmail, user.username, dto.code)) {
			await this.profile.changeEmail(userId, dto.newEmail)
			return {
				message: "Правильный код!"
			}
		} else {
			throw new ConflictException('Неверный код!')
		}
	}

	async changePassword(dto: changePasswordDto, userId: number) {
		const user = await this.userRepo.getUserFromId(userId)
		if (!await this.userRepo.comparisonPassword(userId, dto.oldPassword)) throw new ConflictException('Старый пароль не верный!')
		if (dto.newPassword !== dto.ConfirmPassword) throw new ConflictException('Пароли не совподают!')
		if (dto.newPassword === dto.oldPassword) throw new ConflictException('Пароль не должен совподать с новым')

		const code = await this.redis.generateTemporaryCode(user.email, user.username, 60)
		await this.mail.sendEmail('DF_Messenger', user.email, "Ваш код для смены пароля", code)
		return {
			message: "Код для смены пароля успешно отправлено на почту!"
		}
	}

	async confirmChangePassword(dto: confirmChangePasswordDto, userId: number) {
		const user = await this.userRepo.getUserFromId(userId)
		if (await this.redis.confirmTemporaryCode(user.email, user.username, dto.code)) {
			const hashedPass = await bcrypt.hash(dto.newPassword, 10)
			await this.profile.changePassword(userId, hashedPass)
			return {
				message: "Код правильный!"
			}
		} else {
			throw new ConflictException('Неверный код!')
		}
	}


}