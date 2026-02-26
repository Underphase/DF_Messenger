import { Controller, HttpCode, HttpStatus, Get, Post, Body, Param, ParseIntPipe, UnauthorizedException, BadRequestException, NotFoundException} from '@nestjs/common'
import { AppKeyService } from './appKey.service'
import { AppKeyDto, AppKeyPasswordDto, DeviceCreateDto, DeviceGetDto } from './dto/appKey.dto'

@Controller('keys')
export class AppKeyController {
	constructor(
		private appKeyService: AppKeyService
	){}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	async getKey(@Body() dto: AppKeyPasswordDto){
		const key = await this.appKeyService.createKey(dto)

		return {
			success: true,
			key: key,
			message: "Не потеряйте ключ!",
			isAdminKey: dto.isAdminKey
		}
	}

	@Post('verify')
	@HttpCode(HttpStatus.OK)
	async verifyKey(@Body() dto: AppKeyDto){
		const keyVerify = await this.appKeyService.keyLogin(dto);
		if(!keyVerify) throw new UnauthorizedException('Ключ неверный!');

		console.log('Успешно подтверждён ключ: ', dto.key);
	  return {
			success: true,
			message: "Правильный ключ!"
		};
	}

	@Post('createDevice')
	@HttpCode(HttpStatus.CREATED)
	async createDevice(@Body() dto: DeviceCreateDto){
		const device = await this.appKeyService.createDevice(dto);

		if(!device){
			throw new BadRequestException('Ошибка при созданий устройства!')
		}
		return {
			success: true,
			deviceId: device.id,
			message: "Устройство успешно создано"
		}
	}

	@Get('device/:deviceId')
	@HttpCode(HttpStatus.OK)
	async getDevice(@Param('deviceId', ParseIntPipe) deviceId: number){
		console.log('getDevice called with:', deviceId);
		const device = await this.appKeyService.gettingDevice(deviceId);

		if (!device) {
    	throw new NotFoundException('Устройство не найдено');
		}

		return {
			success: true,
			deviceKey: device.deviceKey,
			message: "Устройство успешно найдено!"
		}
	}
}