import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MessageType } from '@prisma/client';

const sendMessageSchema = z.object({
  chatId:          z.number().int().positive(),
  type:            z.nativeEnum(MessageType),
  content:         z.string().optional(),
  mediaUrl:        z.string().url().optional(),
  forwardedFromId: z.number().int().positive().optional(),
});

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
export type SendMessage = z.infer<typeof sendMessageSchema>;