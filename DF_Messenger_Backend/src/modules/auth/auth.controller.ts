import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { AuthService } from './auth.service'
import { userLogin, userLoginDto, userRegisterDto, userSendCodeDto, userVerifyDto } from './dto/common.dto'
import { Throttle } from '@nestjs/throttler'


@Controller('auth')
export class AuthController {
	constructor(
		private authService: AuthService
	) {}

	@Post('register')
	@Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 }})
	@HttpCode(HttpStatus.OK)
	async register(@Body() dto: userRegisterDto){
		const isSendCode = await this.authService.registerUser(dto);
		if(isSendCode){
			return{
				message: "Код успешно отправлен на почту!",
				expiresIn: isSendCode.expiresIn
			}
		}
	}

	@Post('login')
	@Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 }})
	@HttpCode(HttpStatus.OK)
	async login(@Body() dto: userLoginDto){
		const isSendCode = await this.authService.loginUser(dto);
		if(isSendCode){
			return{
				message: "Код успешно отправлен на почту!",
				expiresIn: isSendCode.expiresIn
			}
		}
	}

	@Post('verify')
	@HttpCode(HttpStatus.CREATED)
	async verify(@Body() dto: userVerifyDto){
		const tokens = await this.authService.verifyUser(dto);
		return {
			message: "Успешный вход!",
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken
		}
	}

	@Post('sendCode')
	@HttpCode(HttpStatus.OK)
	async sendCode(@Body() dto: userSendCodeDto){
		const code = await this.authService.sendVerifyCode(dto);
		return {
			message: "Код снова отправлен на почту",
			expiresIn: code.expiresIn
		}
	}
}