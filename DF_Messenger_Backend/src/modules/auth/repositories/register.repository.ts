import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../db/PrismaModule/prisma.service'


@Injectable()
export class RegisterRepository {
	constructor(
		private prisma: PrismaService
	) { }

	async createUser(userEmail: string, userNickName: string, userPassword: string) {

		const user = await this.prisma.user.create({
			data: {
				email: userEmail,
				nickName: userNickName,
				password: userPassword
			}
		})

		return user
	}
}