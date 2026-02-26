import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const getRefreshSchema = z.object({
	oldRefreshToken: z.string().nonempty()
})

export class getRefreshDto extends createZodDto(getRefreshSchema) {}
export type getRefresh = z.infer<typeof getRefreshSchema>

const profileUpdateSchema = z.object({
	description: z.string().max(150, 'Вы превысили лимит символов').optional(),
	nickName: z.string().max(30, 'Имя не должно превышать 30 символов!').nonempty('Поле не должно быть пустым').optional(),
	username: z.string().max(12, 'Не должно превышать 12 символов').min(5, 'Минимум 5 символов').nonempty().optional()
})

export class profileUpdateDto extends createZodDto(profileUpdateSchema) {}
export type profileUpdate = z.infer<typeof profileUpdateSchema>

const changeEmailSchema = z.object({
	oldEmail: z.string().nonempty().max(320, 'Нельзя превышать 320 символов!'),
	newEmail: z.string().nonempty().max(320, 'Нельзя превышать 320 символов!')
})
export class changeEmailDto extends createZodDto(changeEmailSchema) {}
export type changeEmail = z.infer<typeof changeEmailSchema>

const confirmChangeEmailSchema = z.object({
	newEmail: z.string().nonempty().max(320, 'Нельзя превышать 320 символов!'),
	code: z.string().length(6)
})
export class confirmChangeEmailDto extends createZodDto(confirmChangeEmailSchema) {}
export type confirmChangeEmail = z.infer<typeof confirmChangeEmailSchema>

const changePasswordSchema = z.object({
	oldPassword: z.string().nonempty('Поле не может быть пустым').min(8, 'Пароль должен состоять как минимум из 8 символов').max(70, 'Пароль не должен превышать 70 символов').trim(),
	newPassword: z.string().nonempty('Поле не может быть пустым').min(8, 'Пароль должен состоять как минимум из 8 символов').max(70, 'Пароль не должен превышать 70 символов').trim(),
	ConfirmPassword: z.string().nonempty('Поле не может быть пустым').min(8, 'Пароль должен состоять как минимум из 8 символов').max(70, 'Пароль не должен превышать 70 символов').trim(),
})

export class changePasswordDto extends createZodDto(changePasswordSchema) {}
export type changePassword = z.infer<typeof changePasswordSchema>

const confirmChangePasswordSchema = z.object({
	newPassword: z.string().nonempty('Поле не может быть пустым').min(8, 'Пароль должен состоять как минимум из 8 символов').max(70, 'Пароль не должен превышать 70 символов').trim(),
	code: z.string().length(6)
})

export class confirmChangePasswordDto extends createZodDto(confirmChangePasswordSchema) {}
export type confirmChangePassword = z.infer<typeof confirmChangePasswordSchema>