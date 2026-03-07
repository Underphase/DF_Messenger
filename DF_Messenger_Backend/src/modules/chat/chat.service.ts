import { Injectable } from '@nestjs/common'
import { ChatRepository } from './chat.repository'
import { SendMessageDto } from './chat.dto'


@Injectable()
export class ChatService{
	constructor(
		private chatRepo: ChatRepository
	){}

	async createChat(userId: number, receiverId: number){
		return await this.chatRepo.createChat(userId, receiverId);
	}

	async getUserChats(userId: number){
		return await this.chatRepo.getUserChats(userId)
	}

	async deleteChat(chatId: number, deleteForEveryone: boolean, currUserId: number){
		return await this.chatRepo.deleteChat(chatId, deleteForEveryone, currUserId);
	}

	async getMessagesFromChat(chatId: number){
		return await this.chatRepo.getMessagesFromChat(chatId);
	}

	async findMessage(search: string, chatId: number){
		return await this.chatRepo.findMessage(search, chatId)
	}

	async getUnreadCount(userId: number){
		return await this.chatRepo.getUnreadCount(userId)
	}
	
	async getUnreadCountsPerChat(userId: number){
		return await this.chatRepo.getUnreadCountsPerChat(userId);
	}

	async sendMessage(dto: SendMessageDto, userId: number) {
		return this.chatRepo.sendMessage(dto.chatId, userId, dto.type, dto.content, dto.mediaUrl)
	}

	async markMessagesAsRead(chatId: number, userId: number) {
		return this.chatRepo.markMessagesAsRead(chatId, userId)
	}
	
	async createReaction(messageId: number, userId: number, emoji: string) {
		return this.chatRepo.createReactionOnMessage(messageId, userId, emoji)
	}
}