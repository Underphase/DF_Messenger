import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { UserRepository } from '../../user/repositories/user.repository'

@Injectable()
export class LoginRepository {
	constructor(
		private userRepo: UserRepository
	) { }

	async loginUser(userEmail: string) {
		const user = await this.userRepo.getUserFromMail(userEmail)

		if (!user) {
			throw new NotFoundException('Пользователь не найден')
		}

		if (user.isVerified === true) {
			return user
		} else {
			throw new ForbiddenException(
				'Аккаунт не подтверждён. Введите код из письма!'
			)
		}

	}
}