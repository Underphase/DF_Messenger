import { Controller, Post, Get, Delete, Body, Query, Req, UseGuards } from '@nestjs/common'
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
    return this.chatService.createChat(req.user!.userId, receiverId)
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
    return this.chatService.deleteChat(chatId, forEveryone, req.user!.userId)
  }

	@Get('messages')
	async getMessages(@Query('chatId') chatId: string) {
		return this.chatService.getMessagesFromChat(Number(chatId))
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
}