/*
  Warnings:

  - You are about to drop the column `pinned_message_id` on the `Chat` table. All the data in the column will be lost.
  - You are about to drop the column `isPinned` on the `Message` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_pinned_message_id_fkey";

-- AlterTable
ALTER TABLE "Chat" DROP COLUMN "pinned_message_id";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "isPinned";

-- CreateTable
CREATE TABLE "ChatPinnedMessage" (
    "id" SERIAL NOT NULL,
    "chatId" INTEGER NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatPinnedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatPinnedMessage_chatId_messageId_userId_key" ON "ChatPinnedMessage"("chatId", "messageId", "userId");

-- AddForeignKey
ALTER TABLE "ChatPinnedMessage" ADD CONSTRAINT "ChatPinnedMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPinnedMessage" ADD CONSTRAINT "ChatPinnedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPinnedMessage" ADD CONSTRAINT "ChatPinnedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
