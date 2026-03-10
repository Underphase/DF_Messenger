-- CreateTable
CREATE TABLE "MessageDeletedFor" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDeletedFor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageDeletedFor_messageId_userId_key" ON "MessageDeletedFor"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "MessageDeletedFor" ADD CONSTRAINT "MessageDeletedFor_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeletedFor" ADD CONSTRAINT "MessageDeletedFor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
