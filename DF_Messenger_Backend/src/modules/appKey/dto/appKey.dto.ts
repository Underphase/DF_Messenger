import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const emptyWarn = 'Это поле не может быть пустым!'

export const AppKeySchema = z.object({
	key: z.string().min(1, emptyWarn)
})

export class AppKeyDto extends createZodDto(AppKeySchema) {}
export type AppKey = z.infer<typeof AppKeySchema>

export const AppKeyPasswordSchema = z.object({
	password: z.string().min(1, emptyWarn),
	isAdminKey: z.boolean()
})

export class AppKeyPasswordDto extends createZodDto(AppKeyPasswordSchema) {}
export type AppKeyPassword = z.infer<typeof AppKeyPasswordSchema>;

export const DeviceCreateSchema = z.object({
	key: z.string().min(1, emptyWarn),
})

export class DeviceCreateDto extends createZodDto(DeviceCreateSchema) {}
export type DeviceCreate = z.infer<typeof DeviceCreateSchema>;

export const DeviceGetSchema = z.object({
	deviceId: z.number().int().min(1, emptyWarn)
})

export class DeviceGetDto extends createZodDto(DeviceGetSchema) {}
export type DeviceGet = z.infer<typeof DeviceGetSchema>;