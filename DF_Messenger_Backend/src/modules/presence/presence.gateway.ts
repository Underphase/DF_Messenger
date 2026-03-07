import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	OnGatewayConnection,
	OnGatewayDisconnect,
	MessageBody,
	ConnectedSocket
} from '@nestjs/websockets'
import { Server, Socket} from 'socket.io'

@WebSocketGateway({
	cors: {origin: '*'},
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server;

	private onlineUsers = new Map<number, string>()

	handleConnection(socket: Socket) {
		console.log('подключился пользователь: ', socket.id)
	}

	handleDisconnect(socket: Socket) {
		for (const [userId, socketId] of this.onlineUsers.entries()) {
			if(socketId === socket.id){
				this.onlineUsers.delete(userId)
				this.server.emit('userOffline', { userId })
				break
			}
		}
	}

	@SubscribeMessage('setOnline')
	handleSetOnline(
		@MessageBody() data: {userId: number},
		@ConnectedSocket() socket: Socket
	) {
		this.onlineUsers.set(data.userId, socket.id);
		this.server.emit('userOnline', { userId: data.userId } )
	}

	@SubscribeMessage('getOnlineStatus')
	handleGetStatus(
		@MessageBody() data: { userId: number }
	){
		const isOnline = this.onlineUsers.has(data.userId);
		return {userId: data.userId, isOnline}
	}
}