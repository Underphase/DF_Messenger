import { Injectable } from '@nestjs/common'
import { FriendRepository } from '../repositories/friend.repository'

@Injectable()
export class FriendService {
  constructor(private friendRepo: FriendRepository) { }

  async searchUser(currUserId: number, searchText: string, skip?: number) {
    return this.friendRepo.searchUser(currUserId, searchText, skip)
  }

  async sendFriendRequest(senderId: number, receiverId: number) {
    return this.friendRepo.sendUserFriendRequest(senderId, receiverId)
  }

  async cancelFriendRequest(senderId: number, requestId: number) {
    return this.friendRepo.cancelFriendRequest(senderId, requestId)
  }

  async respondToRequest(friendshipId: number, userId: number, action: 'ACCEPTED' | 'DECLINED') {
    return this.friendRepo.respondToRequest(friendshipId, userId, action)
  }

  async deleteFriend(userId: number, friendId: number) {
    return this.friendRepo.deleteUserFriend(userId, friendId)
  }

  async getFriends(userId: number, skip?: number) {
    return this.friendRepo.getUserFriends(userId)
  }

  async getSentRequests(userId: number) {
    return this.friendRepo.getUserSendedFriends(userId)
  }

  async getReceivedRequests(userId: number) {
    return this.friendRepo.getUserReceivedFriends(userId)
  }

  async getPendingRequestsCount(userId: number) {
    return this.friendRepo.getPendingRequestsCount(userId)
  }

  async getMutualFriends(userId: number, targetId: number) {
    return this.friendRepo.getMutualFriends(userId, targetId)
  }

  async getFriendshipStatus(userId: number, targetId: number) {
    return this.friendRepo.getFriendshipStatus(userId, targetId)
  }

  async blockUser(blockerId: number, blockedId: number) {
    return this.friendRepo.blockUser(blockerId, blockedId)
  }

  async unblockUser(blockerId: number, blockedId: number) {
    return this.friendRepo.unblockUser(blockerId, blockedId)
  }

  async getBlockedUsers(userId: number, skip?: number) {
    return this.friendRepo.getBlockedUsers(userId)
  }
}