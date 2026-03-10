/*
  Warnings:

  - Added the required column `pinnedMessageId` to the `Chat` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'AUDIO';

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "pinnedMessageId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "username" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_pinnedMessageId_fkey" FOREIGN KEY ("pinnedMessageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
