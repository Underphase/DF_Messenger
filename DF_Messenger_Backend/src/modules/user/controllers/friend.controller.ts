import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Query,
	Req,
	UseGuards,
} from '@nestjs/common'
import { JwtGuard, type AuthRequest } from '../../../guards/jwt.guard'
import { FriendService } from '../services/friend.service'

@UseGuards(JwtGuard)
@Controller('friends')
export class FriendController {
	constructor(private friendService: FriendService) { }

	// /friends/search?q=john&skip=0
	@Get('search')
	searchUser(
		@Req() req: AuthRequest,
		@Query('q') searchText: string,
		@Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
	) {
		return this.friendService.searchUser(req.user!.userId, searchText, skip)
	}

	@Get()
	getFriends(
		@Req() req: AuthRequest,
		@Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
	) {
		return this.friendService.getFriends(req.user!.userId, skip)
	}

	// /friends/:friendId
	@Delete(':friendId')
	@HttpCode(HttpStatus.OK)
	deleteFriend(
		@Req() req: AuthRequest,
		@Param('friendId', ParseIntPipe) friendId: number,
	) {
		return this.friendService.deleteFriend(req.user!.userId, friendId)
	}

	// /friends/mutual/:targetId
	@Get('mutual/:targetId')
	getMutualFriends(
		@Req() req: AuthRequest,
		@Param('targetId', ParseIntPipe) targetId: number,
	) {
		return this.friendService.getMutualFriends(req.user!.userId, targetId)
	}

	// /friends/status/:targetId
	@Get('status/:targetId')
	getFriendshipStatus(
		@Req() req: AuthRequest,
		@Param('targetId', ParseIntPipe) targetId: number,
	) {
		return this.friendService.getFriendshipStatus(req.user!.userId, targetId)
	}

	// /friends/requests/:receiverId
	@Post('requests/:receiverId')
	sendFriendRequest(
		@Req() req: AuthRequest,
		@Param('receiverId', ParseIntPipe) receiverId: number,
	) {
		return this.friendService.sendFriendRequest(req.user!.userId, receiverId)
	}

	// /friends/requests/:requestId/cancel
	@Delete('requests/:requestId/cancel')
	@HttpCode(HttpStatus.OK)
	cancelFriendRequest(
		@Req() req: AuthRequest,
		@Param('requestId', ParseIntPipe) requestId: number,
	) {
		return this.friendService.cancelFriendRequest(req.user!.userId, requestId)
	}

	// /friends/requests/:friendshipId
	@Patch('requests/:friendshipId')
	respondToRequest(
		@Req() req: AuthRequest,
		@Param('friendshipId', ParseIntPipe) friendshipId: number,
		@Body('action') action: 'ACCEPTED' | 'DECLINED',
	) {
		return this.friendService.respondToRequest(friendshipId, req.user!.userId, action)
	}

	// /friends/requests/sent
	@Get('requests/sent')
	getSentRequests(@Req() req: AuthRequest) {
		return this.friendService.getSentRequests(req.user!.userId)
	}

	// /friends/requests/received
	@Get('requests/received')
	getReceivedRequests(@Req() req: AuthRequest) {
		return this.friendService.getReceivedRequests(req.user!.userId)
	}

	// /friends/requests/count
	@Get('requests/count')
	getPendingRequestsCount(@Req() req: AuthRequest) {
		return this.friendService.getPendingRequestsCount(req.user!.userId)
	}

	// /friends/block/:blockedId
	@Post('block/:blockedId')
	blockUser(
		@Req() req: AuthRequest,
		@Param('blockedId', ParseIntPipe) blockedId: number,
	) {
		return this.friendService.blockUser(req.user!.userId, blockedId)
	}

	// /friends/block/:blockedId
	@Delete('block/:blockedId')
	@HttpCode(HttpStatus.OK)
	unblockUser(
		@Req() req: AuthRequest,
		@Param('blockedId', ParseIntPipe) blockedId: number,
	) {
		return this.friendService.unblockUser(req.user!.userId, blockedId)
	}

	// /friends/block
	@Get('block')
	getBlockedUsers(
		@Req() req: AuthRequest,
		@Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
	) {
		return this.friendService.getBlockedUsers(req.user!.userId, skip)
	}
}