import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../db/PrismaModule/prisma.service'
import { nanoid } from 'nanoid'


@Injectable()
export class RegisterRepository {
	constructor(
		private prisma: PrismaService
	) { }

	async createUser(userEmail: string, userNickName: string, userPassword: string) {
		const count = await this.prisma.user.count({
			where: {isVerified: true}
		})
		const username = `User_${count}`

		const user = await this.prisma.user.create({
			data: {
				email: userEmail,
				nickName: userNickName,
				password: userPassword,
				username
			}
		})

		return user
	}
}