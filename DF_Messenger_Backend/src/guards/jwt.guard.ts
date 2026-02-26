import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { Request } from 'express'
import jwt from 'jsonwebtoken'

interface JwtPayload {
  id: number
}
export interface AuthRequest extends Request {
  user?: { userId: number };
}

@Injectable()
export class JwtGuard implements CanActivate {
	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<AuthRequest>();
		const token = this.extractToken(request);
		if (!token) throw new UnauthorizedException('Token not provided');

		try {
			const payload = jwt.verify(token, process.env.JWT_ACCESS_KEY!) as JwtPayload;
			request.user = { userId: payload.id };
		} catch {
			throw new UnauthorizedException('Invalid or expired token');
		}

		return true;
	}

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null
    return authHeader.split(' ')[1]
  }
}