import { Injectable } from '@nestjs/common'
import { User } from '@prisma/client'
import jwt from 'jsonwebtoken'

@Injectable()
export class CommonService {
	constructor(
	) { }

	async generateTokens(user: Omit<User, 'password'>) {
		const payload = {
			id: user.id
		}
		const accessToken = jwt.sign(
			payload,
			process.env.JWT_ACCESS_KEY!,
			{ expiresIn: '15m' }
		)

		const expiresRefresh = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

		const refreshToken = crypto.randomUUID();
		
		return {
			accessToken,
			refreshToken,
			expiresAtRefreshToken: expiresRefresh
		}
	}

	async generateAccessToken(data: object){
		return jwt.sign(
			data,
			process.env.JWT_ACCESS_KEY!,
			{ expiresIn: '15m' }
		)
	}
}