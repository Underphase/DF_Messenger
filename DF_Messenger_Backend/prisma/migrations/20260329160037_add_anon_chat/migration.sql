-- CreateTable
CREATE TABLE "AnonQueue" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonChat" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonParticipant" (
    "id" SERIAL NOT NULL,
    "chatId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "anonName" TEXT NOT NULL,

    CONSTRAINT "AnonParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonMessage" (
    "id" SERIAL NOT NULL,
    "chatId" INTEGER NOT NULL,
    "anonName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnonQueue_userId_key" ON "AnonQueue"("userId");

-- AddForeignKey
ALTER TABLE "AnonQueue" ADD CONSTRAINT "AnonQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonParticipant" ADD CONSTRAINT "AnonParticipant_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AnonChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonParticipant" ADD CONSTRAINT "AnonParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonMessage" ADD CONSTRAINT "AnonMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AnonChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
