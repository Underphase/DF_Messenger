import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { AppKeyRepository } from './appKey.repository'
import { AppKeyDto, AppKeyPasswordDto, DeviceCreateDto, DeviceGetDto } from './dto/appKey.dto'
import { PrismaService } from '../../db/PrismaModule/prisma.service'

@Injectable()
export class AppKeyService {
	constructor(
		private appKeyRepo: AppKeyRepository,
		private prisma: PrismaService
	) {}

	async createKey(dto: AppKeyPasswordDto) {
    if (!dto.password || dto.password !== process.env.ADMIN_KEY_PASSWORD) {
      throw new UnauthorizedException("Только админ может генерировать ключи");
    }
		const generatedKey = await this.appKeyRepo.generateKey(dto.isAdminKey);
		return generatedKey;
	}

	async keyLogin(dto: AppKeyDto){
		return this.prisma.$transaction(async (tx) => {
			const keyRecord = await tx.appKeys.findUnique({
				where: { key: dto.key}
			});

			if(!keyRecord) {
				throw new NotFoundException('Ключ не найден')
			}

			if(keyRecord.adminKey === false){
				await tx.appKeys.delete({
					where: {key: dto.key, adminKey: false }
				});
			}
			return true;
		})
	}

	async createDevice(dto: DeviceCreateDto){
		const device = await this.appKeyRepo.addDevice(dto.key);
		return device;
	}

	async gettingDevice(deviceId: number){
		const device = await this.appKeyRepo.getDevice(deviceId);
		if(!device) throw new NotFoundException('Такого девайса не существует!')
		return device;
	}
}