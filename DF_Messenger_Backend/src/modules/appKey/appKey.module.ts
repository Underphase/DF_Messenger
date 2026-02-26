import { Module } from '@nestjs/common'
import { AppKeyController } from './appKey.controller'
import { AppKeyRepository } from './appKey.repository'
import { AppKeyService } from './appKey.service'


@Module({
	imports: [],
	controllers: [AppKeyController],
	exports: [AppKeyRepository, AppKeyService],
	providers: [AppKeyRepository, AppKeyService]
})
export class AppKeyModule {}