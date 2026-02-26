import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import bcrypt from 'bcrypt'
import { PrismaService } from '../../../db/PrismaModule/prisma.service'


@Injectable()
export class ProfileRepository {
	constructor(
		private prisma: PrismaService
	) {}

	async updateProfile(userId: number, newDescription?: string, newUserNickName?: string, newUsername?: string){
		if(newUsername){
			const isExist = await this.prisma.user.findUnique({where: { username: newUsername }});
			if(isExist && isExist.id !== userId) throw new ConflictException('Пользователь с таким username уже существует!') 
		}
		const updatedUser = await this.prisma.user.update({
			where: {id: userId},
			data: {description: newDescription, nickName: newUserNickName, username: newUsername}
		})
		return {
			message: "Изменения прошли успешно",
			description: updatedUser.description,
			userNickName: updatedUser.nickName,
			username: updatedUser.username
		}
	}

	async saveUserAvatarUrl(userId: number, userAvatarUrl: string){
		await this.prisma.user.update({
			where: {id: userId},
			data: { avatarUrl: userAvatarUrl }
		})
	}

	async changeEmail(userId: number, newEmail: string){
		await this.prisma.user.update({
			where: {id: userId},
			data: { email: newEmail }
		})
	}

	async changePassword(userId: number, newPassword: string){
		await this.prisma.user.update({
			where: {id: userId},
			data: { password: newPassword }
		})
	}
}