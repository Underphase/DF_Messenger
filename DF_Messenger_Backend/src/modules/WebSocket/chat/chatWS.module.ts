import { Module } from '@nestjs/common';
import { ChatGateway } from './chatWS.gateway'
import { ChatModule } from '../../chat/chat.module'
import { minioModule } from '../../../db/minio/minio.module'
import { UserModule } from '../../user/user.module'

@Module({
	providers: [ChatGateway],
	exports: [ChatGateway],
	imports: [ChatModule, minioModule, UserModule]
})
export class ChatWSModule {}
