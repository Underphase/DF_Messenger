import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { MinioService } from '../../../db/minio/minio.service'
import { ChatService } from '../../chat/chat.service'
import { MessageType } from '@prisma/client'

interface JwtPayload { id: number }

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server

  constructor(
    private chatService: ChatService,
    private minioService: MinioService
  ) {}

  handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token?.replace('Bearer ', '')
      if (!token) { socket.disconnect(); return }
      const payload = jwt.verify(token, process.env.JWT_ACCESS_KEY!) as JwtPayload
      socket.data.userId = payload.id
    } catch {
      socket.disconnect()
    }
  }

  @SubscribeMessage('join_chat')
  async handleJoinChat(
    @MessageBody() data: { chatId: number },
    @ConnectedSocket() socket: Socket
  ) {
    socket.join(`chat_${data.chatId}`)

    const messages = await this.chatService.getMessagesFromChat(data.chatId)

    const messagesWithUrls = await Promise.all(
      messages.map(async (msg) => {
        if (msg.mediaUrl && msg.type !== MessageType.TEXT) {
          return {
            ...msg,
            mediaUrl: await this.minioService.getDownloadUrl('chat-media', msg.mediaUrl)
          }
        }
        return msg
      })
    )

    return { success: true, messages: messagesWithUrls }
  }

  @SubscribeMessage('leave_chat')
  handleLeaveChat(
    @MessageBody() data: { chatId: number },
    @ConnectedSocket() socket: Socket
  ) {
    socket.leave(`chat_${data.chatId}`)
    return { success: true }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: { chatId: number; content: string },
    @ConnectedSocket() socket: Socket
  ) {
    const userId = socket.data.userId
		if (!userId) return { error: 'Не авторизован' }

		const message = await this.chatService.sendMessage(
			{ chatId: data.chatId, type: MessageType.TEXT, content: data.content },
			userId
		)

    this.server.to(`chat_${data.chatId}`).emit('new_message', message)
    return message
  }

  @SubscribeMessage('request_upload_url')
  async handleRequestUploadUrl(
    @MessageBody() data: { chatId: number; filename: string },
    @ConnectedSocket() socket: Socket
  ) {
		 const userId = socket.data.userId
  	if (!userId) return { error: 'Не авторизован' }

    const key = `chat/${data.chatId}/${uuidv4()}-${data.filename}`
    const uploadUrl = await this.minioService.getUploadUrl('chat-media', key)
    return { uploadUrl, key }
  }

  @SubscribeMessage('confirm_media')
  async handleConfirmMedia(
    @MessageBody() data: { chatId: number; key: string; type: MessageType },
    @ConnectedSocket() socket: Socket
  ) {
    const userId = socket.data.userId
		if (!userId) return { error: 'Не авторизован' }

    const exists = await this.minioService.checkExists('chat-media', data.key)
    if (!exists) return { error: 'Файл не найден в хранилище' }

		const message = await this.chatService.sendMessage(
			{ chatId: data.chatId, type: data.type, mediaUrl: data.key },
			userId
		)

    const mediaUrl = await this.minioService.getDownloadUrl('chat-media', data.key)

    this.server.to(`chat_${data.chatId}`).emit('new_message', {
      ...message,
      mediaUrl
    })

    return { ...message, mediaUrl }
  }

  @SubscribeMessage('react_message')
  async handleReaction(
    @MessageBody() data: { chatId: number; messageId: number; emoji: string },
    @ConnectedSocket() socket: Socket
  ) {
    const userId = socket.data.userId
		if (!userId) return { error: 'Не авторизован' }

    const result = await this.chatService.createReaction(data.messageId, userId, data.emoji)

    this.server.to(`chat_${data.chatId}`).emit('message_reaction', {
      messageId: data.messageId,
      userId,
      emoji: data.emoji,
      action: result.action
    })

    return result
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { chatId: number },
    @ConnectedSocket() socket: Socket
  ) {
    const userId = socket.data.userId
		if (!userId) return { error: 'Не авторизован' }

    socket.to(`chat_${data.chatId}`).emit('user_typing', { userId, chatId: data.chatId })
  }

  @SubscribeMessage('stop_typing')
  handleStopTyping(
    @MessageBody() data: { chatId: number },
    @ConnectedSocket() socket: Socket
  ) {
    const userId = socket.data.userId
		if (!userId) return { error: 'Не авторизован' }
    socket.to(`chat_${data.chatId}`).emit('user_stop_typing', { userId, chatId: data.chatId })
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @MessageBody() data: { chatId: number },
    @ConnectedSocket() socket: Socket
  ) {
    const userId = socket.data.userId
		if (!userId) return { error: 'Не авторизован' }
    await this.chatService.markMessagesAsRead(data.chatId, userId)

    this.server.to(`chat_${data.chatId}`).emit('messages_read', {
      chatId: data.chatId,
      userId
    })

    const unreadCount = await this.chatService.getUnreadCount(userId)
    socket.emit('unread_count', { count: unreadCount })
  }
}