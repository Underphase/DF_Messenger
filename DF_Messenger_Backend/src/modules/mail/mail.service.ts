import { Injectable } from '@nestjs/common'
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
	private transporter: Transporter;

	constructor() {
		this.transporter = nodemailer.createTransport({
			service: 'gmail',
			auth: {
				user: process.env.MAIL_USER,
				pass: process.env.MAIL_PASS
			}
		});
	}

	async sendEmail(
		from: string,
		to: string | string[],
		subject: string,
		text?: string,
		html?: string){
		try{
			const info = await this.transporter.sendMail(
				{
					from,
					to,
					subject,
					text,
					html
				}
			);
			console.log('Сообщение отправлено на почту: ', info.messageId);
		}catch(err){
			console.error('Ошибка отправки почты: ', err);
			throw err;
		}
	}
	
}