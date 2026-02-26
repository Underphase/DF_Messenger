import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../db/PrismaModule/prisma.service'

export type FriendshipStatusResult =
  | 'FRIENDS'
  | 'REQUEST_SENT'
  | 'REQUEST_RECEIVED'
  | 'BLOCKED_BY_ME'
  | 'BLOCKED_BY_THEM'
  | 'NONE'

@Injectable()
export class FriendRepository {
	constructor(
		private prisma: PrismaService
	) {}

	async searchUser(currUserId: number, searchText: string, skip: number = 0){
		return await this.prisma.user.findMany({
			where: {
				AND: [
					{ username: {contains: searchText, mode: 'insensitive'} },
					{ id: { not: currUserId }},

					{ blockedByUsers: {none: {blockerId: currUserId } } },
					{ blockedUsers: {none: {blockedId: currUserId} } }
				]
			},
			select: {
				id: true,
				username: true,
				nickName: true,
				description: true,
				avatarUrl: true
			},
			take: 10,
			skip,
			orderBy: { username: 'asc' }
		})
	}

	async sendUserFriendRequest(senderId: number, receiverId: number){
		if(receiverId === senderId) throw new ConflictException('Вы не можете отправить запрос самому себе!');

		const block = await this.prisma.block.findFirst({
			where: {
				OR: [
					{blockerId: senderId, blockedId: receiverId},
					{blockerId: receiverId, blockedId: senderId}
				]
			}
		})
		if(block) throw new ForbiddenException('Действие недоступно (вы или вас заблокировали)')

		const existing = await this.prisma.friendship.findFirst({
			where: {
				OR: [
					{senderId: senderId, receiverId: receiverId},
					{senderId: receiverId, receiverId: senderId}
				]
			}
		})
		if(existing) throw new ConflictException('Запрос на отправление в друзья');

		return await this.prisma.friendship.create({
			data: {senderId, receiverId, status: "PENDING"}
		})
	}

	async deleteUserFriend(userId: number, friendId: number){
		return this.prisma.friendship.deleteMany({
			where: {
				status: "ACCEPTED",
				OR: [
					{senderId: userId, receiverId: friendId},
					{senderId: friendId, receiverId: userId}
				]
			}
		})
	}

	async getUserFriends(userId: number, skip: number = 0){
		const friendships = await this.prisma.friendship.findMany({
			where: {
				status: "ACCEPTED",
				OR: [
					{senderId: userId},
					{receiverId: userId}
				]
			},
			include: {
				sender: {select: { id:  true, nickName: true, username: true, description: true, avatarUrl: true} },
				receiver: {select: { id:  true, nickName: true, username: true, description: true, avatarUrl: true} }
			},
			take: 10,
			skip
		})

		return friendships.map(f =>
			f.senderId === userId ? f.receiver : f.sender
		)
	}

  async getMutualFriends(userId: number, targetId: number) {
    const [userFriends, targetFriends] = await Promise.all([
      this.prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        select: { senderId: true, receiverId: true },
      }),
      this.prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ senderId: targetId }, { receiverId: targetId }],
        },
        select: { senderId: true, receiverId: true },
      }),
    ])

    const extractIds = (friendships: { senderId: number; receiverId: number }[], id: number) =>
      friendships.map(f => (f.senderId === id ? f.receiverId : f.senderId))

    const userFriendIds = new Set(extractIds(userFriends, userId))
    const mutualIds = extractIds(targetFriends, targetId).filter(id => userFriendIds.has(id))

    if (mutualIds.length === 0) return []

    return this.prisma.user.findMany({
      where: { id: { in: mutualIds } },
      select: { id: true, username: true, nickName: true, avatarUrl: true },
    })
  }

	async getUserSendedFriends(userId: number) {
			const friendships = await this.prisma.friendship.findMany({
					where: { status: "PENDING", senderId: userId },
					include: {
							receiver: { select: { id: true, nickName: true, username: true, description: true, avatarUrl: true } }
					}
			})

			return friendships.map(f => ({ friendshipId: f.id, ...f.receiver }))
	}

	async getUserReceivedFriends(userId: number) {
			const friendships = await this.prisma.friendship.findMany({
					where: { status: "PENDING", receiverId: userId },
					include: {
							sender: { select: { id: true, nickName: true, username: true, description: true, avatarUrl: true } }
					}
			})

			return friendships.map(f => ({ friendshipId: f.id, ...f.sender }))
	}

	async respondToRequest(friendshipId: number, userId: number, action: "ACCEPTED" | "DECLINED"){
		const friendship = await this.prisma.friendship.findUnique({
			where: {id: friendshipId}
		})

		if(!friendship) throw new NotFoundException('Запрос не найден');
		if(friendship.receiverId !== userId) throw new ForbiddenException('Нет доступа')

		return this.prisma.friendship.update({
			where: { id: friendshipId },
			data: { status: action}
		})
	}

  async cancelFriendRequest(senderId: number, requestId: number) {
    const request = await this.prisma.friendship.findUnique({
      where: { id: requestId },
    })

    if (!request) throw new NotFoundException('Запрос не найден')
    if (request.senderId !== senderId) throw new ForbiddenException('Нет доступа')
    if (request.status !== 'PENDING') throw new ConflictException('Запрос уже обработан')

    return this.prisma.friendship.delete({
      where: { id: requestId },
    })
  }

	async getPendingRequestsCount(userId: number) {
			const count = await this.prisma.friendship.count({
					where: { status: 'PENDING', receiverId: userId },
			})
			return { count }
	}

  async getFriendshipStatus(userId: number, targetId: number): Promise<FriendshipStatusResult> {
    const [block, friendship] = await Promise.all([
      this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: targetId },
            { blockerId: targetId, blockedId: userId },
          ],
        },
      }),
      this.prisma.friendship.findFirst({
        where: {
          OR: [
            { senderId: userId, receiverId: targetId },
            { senderId: targetId, receiverId: userId },
          ],
        },
      }),
    ])

    if (block) {
      return block.blockerId === userId ? 'BLOCKED_BY_ME' : 'BLOCKED_BY_THEM'
    }

    if (!friendship) return 'NONE'
    if (friendship.status === 'ACCEPTED') return 'FRIENDS'
    if (friendship.status === 'PENDING') {
      return friendship.senderId === userId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED'
    }

    return 'NONE'
  }

	async blockUser(blockerId: number, blockedId: number){
		if(blockerId === blockedId) throw new ConflictException('Нельзя заблокировать самого себя!');

		const existing = await this.prisma.block.findUnique({
			where: {blockerId_blockedId: {blockerId, blockedId}}
		})
		if(existing) throw new ConflictException('Пользователь уже заблокирован');

		await this.prisma.friendship.deleteMany({
			where: {
				OR: [
					{ senderId: blockerId, receiverId: blockedId },
          { senderId: blockedId, receiverId: blockerId },
				]
			}
		})

		return this.prisma.block.create({
			data: {blockerId, blockedId}
		})
	}

	async unblockUser(blockerId: number, blockedId: number){
    const existing = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } }
    })
    if (!existing) throw new NotFoundException('Блокировка не найдена')

    return this.prisma.block.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } }
    })
	}

	async getBlockedUsers(blockerId: number, skip: number = 0){
    const blocks = await this.prisma.block.findMany({
      where: { blockerId },
      include: {
        blocked: { select: { id: true, username: true, nickName: true, avatarUrl: true } }
      },
			take: 10,
			skip
    })

    return blocks.map(b => b.blocked)
	}

  async isBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    const block = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    })
    return !!block
  }
}