import { createZodDto } from 'nestjs-zod'
import { z } from 'zod';

const userRegisterSchema = z.object({
	email: z.email().nonempty().trim().max(320, 'Нельзя превышать 320 символов!'),
	nickName: z.string().nonempty().max(30, 'Имя не должно быть выше 30 символов!'),
	password: z.string().nonempty('Поле не может быть пустым').min(8, 'Пароль должен состоять как минимум из 8 символов').max(70, 'Пароль не должен превышать 70 символов').trim(),
});

export class userRegisterDto extends createZodDto(userRegisterSchema) {}
export type userRegister = z.infer<typeof userRegisterSchema>

const userVerifySchema = z.object({
	email: z.email().nonempty().trim().max(320, 'Нельзя превышать 320 символов!'),
	code: z.string().length(6, 'Код состоит из 6 символов.').trim().nonempty()
})

const userSendCodeSchema = userVerifySchema.pick({email: true});
export class userSendCodeDto extends createZodDto(userSendCodeSchema) {}
export type userSendCode = z.infer<typeof userSendCodeSchema>

export class userVerifyDto extends createZodDto(userVerifySchema) {}
export type userVerify = z.infer<typeof userVerifySchema>

const userLoginSchema = z.object({
	email: z.email().nonempty().trim().max(320, 'Нельзя превышать 320 символов!'),
	password: z.string().nonempty('Поле не может быть пустым').min(8, 'Пароль должен состоять как минимум из 8 символов').max(70, 'Пароль не должен превышать 70 символов').trim(),
})

export class userLoginDto extends createZodDto(userLoginSchema) {}
export type userLogin = z.infer<typeof userLoginSchema>