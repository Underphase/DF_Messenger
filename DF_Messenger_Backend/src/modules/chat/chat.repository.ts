import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../db/PrismaModule/prisma.service'
import { MessageType } from '@prisma/client'


@Injectable()
export class ChatRepository {
	constructor(
		private prisma: PrismaService
	) {}

	async createChat(userId: number, receiverId: number){

		let chat = await this.prisma.chat.findFirst({
			where: {
				participants: { 
					every: {
						userId: { in: [userId, receiverId] }
					}
				}
			},
			include: { participants: true }
		})
		if(!chat) {
			chat = await this.prisma.chat.create({
				data: {
					participants: {
						create: [
							{ userId },
							{ userId: receiverId }
						]
					}
				},
				include: { participants: true }
			});
		}

		return chat
	}

	async getUserChats(userId: number){
		return await this.prisma.chat.findMany({
			where: {
				participants: {
					some: {userId}
				}
			},
			include: {
				participants: {
					select: {
						user: {
							select: {
								id: true,
								nickName: true,
								username: true,
								avatarUrl: true
							}
						}
					}
				},
				messages: {
					orderBy: { createdAt: 'desc' },
					take: 1,
					include: {
						sender: {
							select: {id: true, nickName: true}
						}
					}
				}
			},
			orderBy: { updatedAt: 'desc'}
		})
	}

	async deleteChat(chatId: number, deleteForEveryone: boolean, currUserId: number){
		const chat = await this.prisma.chat.findUnique({
			where: {id: chatId},
			include: { participants: { select: {userId: true } } }
		});

		if (!chat) throw new Error('Чат не найден');
		if (!chat.participants.some(p => p.userId === currUserId)) {
			throw new Error('Вы не являетсесь участником чата');
		}

		if(deleteForEveryone){
			await this.prisma.chat.delete({ where: { id: chatId } });
		} else {
			await this.prisma.chatParticipant.delete({
				where: {
					chatId_userId: {chatId, userId: currUserId}
				}
			})
		}

		return {
			success: true,
			deleteForEveryone: deleteForEveryone
		}
	}

	async sendMessage(chatId: number, userId: number, type: MessageType, content?: string, mediaUrl?: string, forwardedFromId?: number){
		return await this.prisma.message.create({
			data: {
				chatId,
				senderId: userId,
				type,
				content,
				mediaUrl,
				forwardedFromId
			},
			include: {
				sender: {
					select: {
						id: true,
						nickName: true,
						username: true,
						avatarUrl: true
					}
				}
			}
		});
	}

	async findMessage(search: string, chatId: number){
		return await this.prisma.message.findMany({
			where: {
				chatId,
				content: {
					contains: search,
					mode: 'insensitive'
				}
			},
			select: {
				id: true,
				content: true,
				createdAt: true,
				sender: true,
				type: true
			},
			orderBy: {createdAt: 'asc'},
			take: 50
		})
	}

	async getMessagesFromChat(chatId: number){
		return await this.prisma.message.findMany({
			where: {
				chatId
			},
			orderBy: {createdAt: 'asc'},
			take: 50,
			include: {
				sender: {
					select: { id: true, username: true, nickName: true, avatarUrl: true }
				},
				reactions: true,
				readReceipts: true
			}
		})
	}

	async createReactionOnMessage(messageId: number, userId: number, emoji: string){
		const existing = await this.prisma.messageReaction.findUnique({
			where: {
				messageId_userId_emoji: {messageId, userId, emoji}
			}
		});

		if(existing){
			await this.prisma.messageReaction.delete({
				where: {id: existing.id}
			});
			return {
				action: 'removed'
			}
		}
		
		await this.prisma.messageReaction.create({
			data: { messageId, userId, emoji}
		});
		return {
			action: 'added'
		}
	}

	async getUnreadCount(userId: number) {
		return this.prisma.message.count({
			where: {
				chat: {
					participants: {
						some: {userId}
					}
				},
				senderId: {not: userId},
				readReceipts: {
					none: {userId}
				}
			}
		})
	}

	async getUnreadCountsPerChat(userId: number){
		return this.prisma.message.groupBy({
			by: ['chatId'],
			where: {
				chat: {
					participants: {
						some: {
							userId
						}
					}
				},
				senderId: { not: userId },
				readReceipts: { none: {userId } }
			},
			_count: {id: true}
		});
	}

	async markMessagesAsRead(chatId: number, userId: number){
		return this.prisma.$transaction(async (tx) => {
			const participant = await tx.chatParticipant.findUnique({
				where: { chatId_userId: {chatId, userId} }
			})
			if(!participant) throw new NotFoundException('Чат не найден');

			const lastUnread = await tx.message.findFirst({
				where: {
					chatId,
					senderId: { not: userId },
					readReceipts: { none: { userId } },
				},
				orderBy: { createdAt: 'desc' },
				select: { createdAt: true }
			});
			const newLastReadAt = lastUnread?.createdAt ?? new Date();

			await tx.chatParticipant.update({
				where: { chatId_userId: {chatId, userId} },
				data: {lastReadAt: newLastReadAt}
			})

			const unreadMessages = await tx.message.findMany({
				where: {
					chatId,
					senderId: { not: userId },
					readReceipts: { none: { userId } }
				},
				select: {id: true}
			});

			if(unreadMessages.length > 0) {
				await tx.messageRead.createMany({
					data: unreadMessages.map(m => ({
						messageId: m.id,
						userId,
						readAt: new Date(),
					})),
					skipDuplicates: true
				});
			}
		});
	}
}