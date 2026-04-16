/*
  Warnings:

  - You are about to drop the `AnonChat` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AnonMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AnonParticipant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AnonQueue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AnonMessage" DROP CONSTRAINT "AnonMessage_chatId_fkey";

-- DropForeignKey
ALTER TABLE "AnonParticipant" DROP CONSTRAINT "AnonParticipant_chatId_fkey";

-- DropForeignKey
ALTER TABLE "AnonParticipant" DROP CONSTRAINT "AnonParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "AnonQueue" DROP CONSTRAINT "AnonQueue_userId_fkey";

-- DropTable
DROP TABLE "AnonChat";

-- DropTable
DROP TABLE "AnonMessage";

-- DropTable
DROP TABLE "AnonParticipant";

-- DropTable
DROP TABLE "AnonQueue";

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
