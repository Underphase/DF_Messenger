  import { Injectable, OnModuleInit } from '@nestjs/common'
  import * as admin from 'firebase-admin'
  import { PrismaService } from '../../../db/PrismaModule/prisma.service'
  import * as fs from 'fs'
  import * as path from 'path'

  @Injectable()
  export class NotificationService implements OnModuleInit {
    constructor(private prisma: PrismaService) {}

    onModuleInit() {
      const serviceAccount = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, '../../../../src/config/serviceAccountKey.json'),
          'utf8'
        )
      )

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      })
    }

    async saveDeviceToken(userId: number, token: string) {
      await this.prisma.deviceToken.upsert({
        where: { token },
        update: { userId },
        create: { userId, token }
      })
    }

    async removeDeviceToken(token: string) {
      await this.prisma.deviceToken.deleteMany({ where: { token } })
    }

    async sendPushToUser(userId: number, title: string, body: string, data?: Record<string, string>) {
      console.log(`[PUSH] looking for userId: ${userId}, type: ${typeof userId}`)
      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true }
      })
      console.log(`[PUSH] found tokens:`, tokens)
      
      console.log(`[PUSH] userId: ${userId}, tokens count: ${tokens.length}`)

      if (tokens.length === 0) {
        console.log(`[PUSH] No tokens for userId: ${userId}`)
        return
      }

      const messages = tokens.map(t => ({
        token: t.token,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            channelId: 'messages'
          }
        }
      }))

      const results = await Promise.allSettled(
        messages.map(msg => admin.messaging().send(msg))
      )

      // удаление нерабочих токенов
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'fulfilled') {
          console.log(`[PUSH] Success:`, result.value)
        } else {
          console.log(`[PUSH] Failed:`, result.reason?.message, result.reason?.code)
        }
      }
    }
  }