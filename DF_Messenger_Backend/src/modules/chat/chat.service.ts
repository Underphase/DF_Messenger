import { Injectable } from '@nestjs/common'
import { ChatRepository } from './chat.repository'
import { SendMessageDto } from './chat.dto'

@Injectable()
export class ChatService {
  constructor(private chatRepo: ChatRepository) {}

  async createChat(userId: number, receiverId: number) {
    return this.chatRepo.createChat(userId, receiverId)
  }

  async getUserChats(userId: number) {
    return this.chatRepo.getUserChats(userId)
  }

  async deleteChat(chatId: number, deleteForEveryone: boolean, currUserId: number) {
    return this.chatRepo.deleteChat(chatId, deleteForEveryone, currUserId)
  }

  async getMessagesFromChat(chatId: number, userId: number) {
    return this.chatRepo.getMessagesFromChat(chatId, userId)
  }

  async findMessage(search: string, chatId: number) {
    return this.chatRepo.findMessage(search, chatId)
  }

  async getPinnedMessages(chatId: number, userId: number) {
    return this.chatRepo.getPinnedMessages(chatId, userId)
  }

  async getMessage(messageId: number) {
    return this.chatRepo.getMessage(messageId)
  }

  async getUnreadCount(userId: number) {
    return this.chatRepo.getUnreadCount(userId)
  }

  async getUnreadCountsPerChat(userId: number) {
    return this.chatRepo.getUnreadCountsPerChat(userId)
  }

  async sendMessage(dto: SendMessageDto, userId: number) {
    return this.chatRepo.sendMessage(
      dto.chatId, userId, dto.type, dto.content, dto.mediaUrl, dto.forwardedFromId,
      dto.musicTitle, dto.musicArtist, dto.musicCover
    )
  }

  async markMessagesAsRead(chatId: number, userId: number) {
    return this.chatRepo.markMessagesAsRead(chatId, userId)
  }

  async createReaction(messageId: number, userId: number, emoji: string) {
    return this.chatRepo.createReactionOnMessage(messageId, userId, emoji)
  }

  async deleteMessage(messageId: number, userId: number, forEveryone: boolean) {
    return this.chatRepo.deleteMessage(messageId, userId, forEveryone)
  }

  async editMessage(messageId: number, userId: number, content: string) {
    return this.chatRepo.editMessage(messageId, userId, content)
  }

  async pinMessage(chatId: number, messageId: number, userId: number, forEveryone: boolean) {
    return this.chatRepo.pinMessage(chatId, messageId, userId, forEveryone)
  }

  async unpinMessage(chatId: number, messageId: number, userId: number) {
    return this.chatRepo.unpinMessage(chatId, messageId, userId)
  }

  async getChatParticipants(chatId: number) {
    return this.chatRepo.getChatParticipants(chatId)
  }

}