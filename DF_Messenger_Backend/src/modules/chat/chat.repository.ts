import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../db/PrismaModule/prisma.service'
import { MessageType } from '@prisma/client'

@Injectable()
export class ChatRepository {
  constructor(private prisma: PrismaService) {}

  async createChat(userId: number, receiverId: number) {
    let chat = await this.prisma.chat.findFirst({
      where: {
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: receiverId } } },
        ]
      },
      include: { participants: true }
    })
    if (!chat) {
      chat = await this.prisma.chat.create({
        data: {
          participants: {
            create: [{ userId }, { userId: receiverId }]
          }
        },
        include: { participants: true }
      })
    }
    return chat
  }

  async getUserChats(userId: number) {
    return this.prisma.chat.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: {
          select: {
            user: {
              select: { id: true, nickName: true, username: true, avatarUrl: true }
            }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, nickName: true } } }
        },
        pinnedMessage: {
          include: {
            sender: { select: { id: true, nickName: true, username: true } }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
  }

  async deleteChat(chatId: number, deleteForEveryone: boolean, currUserId: number) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: { select: { userId: true } } }
    })
    if (!chat) throw new NotFoundException('Чат не найден')
    if (!chat.participants.some(p => p.userId === currUserId)) {
      throw new ForbiddenException('Вы не являетесь участником чата')
    }

    if (deleteForEveryone) {
      await this.prisma.chat.delete({ where: { id: chatId } })
    } else {
      await this.prisma.chatParticipant.delete({
        where: { chatId_userId: { chatId, userId: currUserId } }
      })
    }

    return { success: true, deleteForEveryone }
  }

  async sendMessage(
    chatId: number,
    userId: number,
    type: MessageType,
    content?: string,
    mediaUrl?: string,
    forwardedFromId?: number
  ) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } }
    })
    if (!participant) throw new ForbiddenException('Вы не участник этого чата')

    if (forwardedFromId) {
      const original = await this.prisma.message.findUnique({ where: { id: forwardedFromId } })
      if (!original) throw new NotFoundException('Оригинальное сообщение не найдено')
    }

    const message = await this.prisma.message.create({
      data: { chatId, senderId: userId, type, content, mediaUrl, forwardedFromId },
      include: {
        sender: { select: { id: true, nickName: true, username: true, avatarUrl: true } },
        forwardedFrom: {
          include: {
            sender: { select: { id: true, nickName: true, username: true } }
          }
        }
      }
    })

    await this.prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    })

    return message
  }

  async deleteMessage(messageId: number, userId: number, forEveryone: boolean) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: { include: { participants: { select: { userId: true } } } } }
    })
    if (!message) throw new NotFoundException('Сообщение не найдено')

    const isParticipant = message.chat.participants.some(p => p.userId === userId)
    if (!isParticipant) throw new ForbiddenException('Вы не участник этого чата')

    if (forEveryone) {

      await this.prisma.chat.updateMany({
        where: { pinnedMessageId: messageId },
        data: { pinnedMessageId: null }
      })

      await this.prisma.message.updateMany({
        where: { forwardedFromId: messageId },
        data: { forwardedFromId: null }
      })

      await this.prisma.message.delete({ where: { id: messageId } })
    } else {
      await this.prisma.messageDeletedFor.create({
        data: { messageId, userId }
      })
    }

    return { success: true, forEveryone, chatId: message.chatId, messageId }
  }

  async editMessage(messageId: number, userId: number, content: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } })
    if (!message) throw new NotFoundException('Сообщение не найдено')
    if (message.senderId !== userId) throw new ForbiddenException('Нельзя редактировать чужое сообщение')
    if (message.type !== MessageType.TEXT) throw new ForbiddenException('Можно редактировать только текстовые сообщения')

    return this.prisma.message.update({
      where: { id: messageId },
      data: { content, updatedAt: new Date() },
      include: {
        sender: { select: { id: true, nickName: true, username: true, avatarUrl: true } },
        forwardedFrom: {
          include: {
            sender: { select: { id: true, nickName: true, username: true } }
          }
        }
      }
    })
  }

  async pinMessage(chatId: number, messageId: number, userId: number) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } }
    })
    if (!participant) throw new ForbiddenException('Вы не участник этого чата')

    const message = await this.prisma.message.findUnique({ where: { id: messageId } })
    if (!message || message.chatId !== chatId) throw new NotFoundException('Сообщение не найдено')

    return this.prisma.chat.update({
      where: { id: chatId },
      data: { pinnedMessageId: messageId },
      include: {
        pinnedMessage: {
          include: { sender: { select: { id: true, nickName: true, username: true } } }
        }
      }
    })
  }

  async unpinMessage(chatId: number, userId: number) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } }
    })
    if (!participant) throw new ForbiddenException('Вы не участник этого чата')

    return this.prisma.chat.update({
      where: { id: chatId },
      data: { pinnedMessageId: null }
    })
  }

  async getChatWithPinned(chatId: number) {
    return this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        pinnedMessage: {
          include: { sender: { select: { id: true, nickName: true, username: true } } }
        }
      }
    })
  }

  async findMessage(search: string, chatId: number) {
    return this.prisma.message.findMany({
      where: {
        chatId,
        content: { contains: search, mode: 'insensitive' }
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        sender: true,
        type: true
      },
      orderBy: { createdAt: 'asc' },
      take: 50
    })
  }

  async getMessagesFromChat(chatId: number, userId: number) {
    return this.prisma.message.findMany({
      where: {
        chatId,
        deletedFor: { none: { userId } }
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        sender: { select: { id: true, username: true, nickName: true, avatarUrl: true } },
        reactions: true,
        readReceipts: true,
        forwardedFrom: {
          include: {
            sender: { select: { id: true, nickName: true, username: true } }
          }
        }
      }
    })
  }

  async createReactionOnMessage(messageId: number, userId: number, emoji: string) {
    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } }
    })

    if (existing) {
      await this.prisma.messageReaction.delete({ where: { id: existing.id } })
      return { action: 'removed' }
    }

    await this.prisma.messageReaction.create({
      data: { messageId, userId, emoji }
    })
    return { action: 'added' }
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.message.count({
      where: {
        chat: { participants: { some: { userId } } },
        senderId: { not: userId },
        readReceipts: { none: { userId } }
      }
    })
    return { count }
  }

  async getUnreadCountsPerChat(userId: number) {
    const groups = await this.prisma.message.groupBy({
      by: ['chatId'],
      where: {
        chat: { participants: { some: { userId } } },
        senderId: { not: userId },
        readReceipts: { none: { userId } }
      },
      _count: { id: true }
    })
    return groups.map(g => ({ chatId: g.chatId, unreadCount: g._count.id }))
  }

  async markMessagesAsRead(chatId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.chatParticipant.findUnique({
        where: { chatId_userId: { chatId, userId } }
      })
      if (!participant) throw new NotFoundException('Чат не найден')

      const lastUnread = await tx.message.findFirst({
        where: {
          chatId,
          senderId: { not: userId },
          readReceipts: { none: { userId } }
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      })
      const newLastReadAt = lastUnread?.createdAt ?? new Date()

      await tx.chatParticipant.update({
        where: { chatId_userId: { chatId, userId } },
        data: { lastReadAt: newLastReadAt }
      })

      const unreadMessages = await tx.message.findMany({
        where: {
          chatId,
          senderId: { not: userId },
          readReceipts: { none: { userId } }
        },
        select: { id: true }
      })

      if (unreadMessages.length > 0) {
        await tx.messageRead.createMany({
          data: unreadMessages.map(m => ({
            messageId: m.id,
            userId,
            readAt: new Date()
          })),
          skipDuplicates: true
        })
      }
    })
  }
}