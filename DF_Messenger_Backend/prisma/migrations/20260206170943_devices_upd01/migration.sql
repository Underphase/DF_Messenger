/*
  Warnings:

  - You are about to drop the column `deviceId` on the `Devices` table. All the data in the column will be lost.
  - Added the required column `deviceKey` to the `Devices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Devices" DROP COLUMN "deviceId",
ADD COLUMN     "deviceKey" TEXT NOT NULL;
