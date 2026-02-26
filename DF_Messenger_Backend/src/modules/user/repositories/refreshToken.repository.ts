import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../../../db/PrismaModule/prisma.service'


@Injectable()
export class RefreshTokenRepository {
	constructor(
		private prisma: PrismaService
	) { }

	async createRefreshToken(userId: number, hashedRefreshToken: string, expiresTime: Date, previousRefreshToken?: string, userFamilyid?: string) {
		const refreshToken = await this.prisma.refreshToken.create({
			data: {
				userId,
				tokenHash: hashedRefreshToken,
				expiresAt: expiresTime,
				usedAt: null,
				previousTokenHash: previousRefreshToken,
				familyId: userFamilyid
			}
		})
		return refreshToken
	}

	async verifyRefreshToken(userRefreshToken: string) {
		const userToken = await this.prisma.refreshToken.findFirst({
			where: {
				tokenHash: userRefreshToken,
				revoked: false,
				expiresAt: { gt: new Date() }
			}
		})

		if (!userToken) throw new UnauthorizedException('Invalid refresh')

		if (userToken.usedAt) {
			await this.prisma.refreshToken.updateMany({
				where: { familyId: userToken.familyId },
				data: { revoked: true }
			});
			throw new UnauthorizedException('Token reused');
		}

		await this.prisma.refreshToken.update({
			where: { id: userToken.id },
			data: { usedAt: new Date() }
		})

		return {
			userId: userToken.userId,
			familyId: userToken.familyId
		}
	}

	async logoutUser(userId: number, familyId?: string){
		const { count } = await this.prisma.refreshToken.updateMany({
			where: {
				userId,
				...(familyId ? { familyId } : {}),
				revoked: false	
			},
			data: {revoked: true}
		})
		return count > 0
	}
}