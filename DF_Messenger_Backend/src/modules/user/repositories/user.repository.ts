import { Injectable, NotFoundException } from '@nestjs/common'
import bcrypt from 'bcrypt'
import { PrismaService } from '../../../db/PrismaModule/prisma.service'


@Injectable()
export class UserRepository {
	constructor(
		private prisma: PrismaService
	) { }

	async comparisonPassword(userId: number, oldPassword: string) {
		const user = await this.prisma.user.findUnique({ where: { id: userId } })
		if (user) {
			return await bcrypt.compare(oldPassword, user.password)
		} else {
			throw new NotFoundException('Пользователь не найден')
		}
	}

	async verifyUser(userId: number) {
		await this.prisma.user.update({
			where: { id: userId },
			data: { isVerified: true }
		})
	}

	async getUserFromMail(email: string) {
		try {
			const user = await this.prisma.user.findUnique({ where: { email } })
			return user
		} catch (err) {
			console.error('Ошибка во время получения пользователя с помощью EMAIL: ', err)
			throw err
		}
	}

	async getUserFromId(id: number) {
		try {
			const user = await this.prisma.user.findUniqueOrThrow({ where: { id } })
			return user
		} catch (err) {
			console.error('Ошибка во время получения пользователя с помощью ID: ', err)
			throw err
		}
	}

	async delUser(id: number) {
		try {
			await this.prisma.user.findUniqueOrThrow({
				where: { id }
			})
		} catch (err) {
			console.error('Ошибка во время удаления пользователя: ', err)
			throw err
		}
	}
}