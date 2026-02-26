import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../db/PrismaModule/prisma.service'


@Injectable()
export class AppKeyRepository {

	constructor(
		private readonly prisma: PrismaService
	){}

	async generateKey(isAdminKey: boolean) {
		const key = crypto.randomUUID();

		await this.prisma.appKeys.create({
			data: { key, adminKey: isAdminKey }
		});

		return key;
	}

	async addDevice(key: string){
		const createdKey = await this.prisma.devices.create({data: {deviceKey: key}});
		return createdKey;
	}

	async getDevice(deviceId: number) {
		const device = await this.prisma.devices.findUnique({where: {id: deviceId}})
		if(!device) throw new NotFoundException('Устройство не найден')
		return device;
	}
}