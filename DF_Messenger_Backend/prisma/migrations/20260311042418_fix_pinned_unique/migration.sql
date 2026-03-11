/*
  Warnings:

  - A unique constraint covering the columns `[chatId,messageId]` on the table `ChatPinnedMessage` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ChatPinnedMessage_chatId_messageId_userId_key";

-- CreateIndex
CREATE INDEX "ChatPinnedMessage_userId_idx" ON "ChatPinnedMessage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatPinnedMessage_chatId_messageId_key" ON "ChatPinnedMessage"("chatId", "messageId");
