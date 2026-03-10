/*
  Warnings:

  - You are about to drop the column `pinnedMessageId` on the `Chat` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_pinnedMessageId_fkey";

-- AlterTable
ALTER TABLE "Chat" DROP COLUMN "pinnedMessageId",
ADD COLUMN     "pinned_message_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_pinned_message_id_fkey" FOREIGN KEY ("pinned_message_id") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
