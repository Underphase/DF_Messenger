import { Module } from '@nestjs/common'
import { ChatRepository } from './chat.repository'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'

@Module({
	providers: [ChatRepository, ChatService],
	exports: [ChatRepository, ChatService],
	controllers: [ChatController]
})
export class ChatModule {}