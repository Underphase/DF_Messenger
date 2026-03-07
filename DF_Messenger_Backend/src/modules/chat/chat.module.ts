import { Module } from '@nestjs/common'
import { ChatRepository } from './chat.repository'
import { ChatController } from './chat.controller'

@Module({
	providers: [ChatRepository],
	controllers: [ChatController]
})
export class ChatModule {}