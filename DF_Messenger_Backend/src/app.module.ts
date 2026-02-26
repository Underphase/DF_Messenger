import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './db/PrismaModule/prisma.module'
import { AppKeyModule } from './modules/appKey/appKey.module'
import { RedisModule } from './db/redis/redis.module'
import { MailModule } from './modules/mail/mail.module'
import { APP_GUARD, APP_PIPE } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import { UserModule } from './modules/user/user.module'
import { CommonModule } from './utils/common.module'
import { AuthModule } from './modules/auth/auth.module'
import { TasksModule } from './tasks/tasks.module'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler'
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import { minioModule } from './db/minio/minio.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true
		}),
		ScheduleModule.forRoot(),
		TasksModule,

		ThrottlerModule.forRoot({
			throttlers: [{
				ttl: 60 * 1000,
				limit: 10
			}],
			storage: new ThrottlerStorageRedisService(process.env.REDIS_URL)
		}),

		PrismaModule,
		RedisModule,
		minioModule,

		AppKeyModule,
		MailModule,
		UserModule,
		CommonModule,
		AuthModule,
	],

	providers: [
		{
			provide: APP_PIPE,
			useClass: ZodValidationPipe,
		},

		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard
		}
		
	]
})

export class AppModule { }