import { Controller, Post, Get, Delete, Patch, Body, Query, Req, UseGuards } from '@nestjs/common'
import { JwtGuard, type AuthRequest } from '../../guards/jwt.guard'
import { ChatService } from './chat.service'

@UseGuards(JwtGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('create')
  async createChat(
    @Req() req: AuthRequest,
    @Body('receiverId') receiverId: number
  ) {
    return this.chatService.createChat(req.user!.userId, +receiverId)
  }

  @Get('list')
  async getUserChats(@Req() req: AuthRequest) {
    return this.chatService.getUserChats(req.user!.userId)
  }

  @Delete('delete')
  async deleteChat(
    @Req() req: AuthRequest,
    @Body('chatId') chatId: number,
    @Body('forEveryone') forEveryone: boolean
  ) {
    return this.chatService.deleteChat(+chatId, forEveryone, req.user!.userId)
  }

  @Get('messages')
  async getMessages(
    @Req() req: AuthRequest,
    @Query('chatId') chatId: string
  ) {
    return this.chatService.getMessagesFromChat(Number(chatId), req.user!.userId)
  }

  @Get('messages/search')
  async findMessage(
    @Query('chatId') chatId: string,
    @Query('q') search: string
  ) {
    return this.chatService.findMessage(search, Number(chatId))
  }

  @Get('unread/count')
  async getUnreadCount(@Req() req: AuthRequest) {
    return this.chatService.getUnreadCount(req.user!.userId)
  }

  @Get('unread/per-chat')
  async getUnreadCountsPerChat(@Req() req: AuthRequest) {
    return this.chatService.getUnreadCountsPerChat(req.user!.userId)
  }

  @Delete('message/delete')
  async deleteMessage(
    @Req() req: AuthRequest,
    @Body('messageId') messageId: number,
    @Body('forEveryone') forEveryone: boolean
  ) {
    return this.chatService.deleteMessage(+messageId, req.user!.userId, forEveryone)
  }

  @Patch('message/edit')
  async editMessage(
    @Req() req: AuthRequest,
    @Body('messageId') messageId: number,
    @Body('content') content: string
  ) {
    return this.chatService.editMessage(+messageId, req.user!.userId, content)
  }

@Post('pin')
async pinMessage(
  @Req() req: AuthRequest,
  @Body('chatId') chatId: number,
  @Body('messageId') messageId: number,
  @Body('forEveryone') forEveryone: boolean
) {
  return this.chatService.pinMessage(+chatId, +messageId, req.user!.userId, forEveryone)
}

  @Delete('unpin')
  async unpinMessage(
    @Req() req: AuthRequest,
    @Body('chatId') chatId: number,
    @Body('messageId') messageId: number
  ) {
    return this.chatService.unpinMessage(+chatId, +messageId, req.user!.userId)
  }

  @Get('pinned')
  async getPinnedMessages(
    @Req() req: AuthRequest,
    @Query('chatId') chatId: string
  ) {
    return this.chatService.getPinnedMessages(Number(chatId), req.user!.userId)
  }
}