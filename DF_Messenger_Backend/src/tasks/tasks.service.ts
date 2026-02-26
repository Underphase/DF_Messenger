import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { RedisService } from '../db/redis/redis.service'
import { PrismaService } from '../db/PrismaModule/prisma.service'


@Injectable()
export class TasksService {
	constructor(
		private redis: RedisService,
		private prisma: PrismaService
	) {}

	@Cron(CronExpression.EVERY_DAY_AT_6AM)
	async clearUnVerifyUsers(){

		try{
			const users = await this.prisma.user.deleteMany(
				{
					where: {
						isVerified: false,
						createdAt: {
							lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
						}
					}
				}
			)
			if (users.count > 0) {
      	console.log(`Удалено ${users.count} неподтвержденных пользователей`);
      }
		}catch(err){
      console.error('Ошибка при удалении неподтвержденных пользователей', err);
      throw err;
		}
	}
}