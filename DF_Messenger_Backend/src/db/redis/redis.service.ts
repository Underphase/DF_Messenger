import { Injectable, NotFoundException, OnModuleDestroy, UnauthorizedException } from '@nestjs/common'
import Redis from 'ioredis'
import { randomInt } from 'crypto';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
	constructor() {
		super(process.env.REDIS_URL!);
	}

	async generateTemporaryCode(userEmail: string, username: string, ttl: number = 300): Promise<string> {
		const code = randomInt(100000, 999999).toString();
		
		await this.setex(`${userEmail}:${username}`, ttl, code);

		return code;
	}

	async confirmTemporaryCode(userEmail: string, username: string, code: string): Promise<boolean> {
		const redisValue = await this.get(`${userEmail}:${username}`);

		if(!redisValue) {
			console.error('Код истёк или не найден!')
			return false;
		}

		if(code === redisValue){
			console.log('Правильный код')
			await this.del(`${userEmail}:${username}`);
			return true;
		}else{
			console.log('Неправильный код')
			return false;
		}
		
	}

	async delTemporaryCode(userEmail: string, username: string){
		await this.del(`${userEmail}:${username}`);
	}

	async CheckTTLKey(key: string): Promise<boolean> {
		await this.getdel(key);
		if(key){
			return true;
		}else{
			return false;
		}
	}

	onModuleDestroy() {
		this.disconnect();
	}
};