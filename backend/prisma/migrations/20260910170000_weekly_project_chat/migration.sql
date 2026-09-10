CREATE TABLE "ProjectChat" (
 "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ProjectChat_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProjectChat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ProjectChat_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProjectChat_projectId_expiresAt_idx" ON "ProjectChat"("projectId", "expiresAt");
CREATE INDEX "ProjectChat_expiresAt_idx" ON "ProjectChat"("expiresAt");
CREATE TABLE "ChatMessage" (
 "id" TEXT NOT NULL, "chatId" TEXT NOT NULL, "userId" TEXT NOT NULL, "clientId" TEXT NOT NULL,
 "bodyCiphertext" TEXT NOT NULL, "bodyNonce" TEXT NOT NULL, "bodyAuthTag" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deletedAt" TIMESTAMP(3),
 CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ProjectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChatMessage_chatId_userId_clientId_key" ON "ChatMessage"("chatId", "userId", "clientId");
CREATE INDEX "ChatMessage_chatId_createdAt_id_idx" ON "ChatMessage"("chatId", "createdAt", "id");
CREATE TABLE "ChatFile" (
 "id" TEXT NOT NULL, "chatId" TEXT NOT NULL, "uploadedById" TEXT NOT NULL, "messageId" TEXT,
 "name" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL,
 "ciphertext" BYTEA NOT NULL, "nonce" TEXT NOT NULL, "authTag" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChatFile_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ChatFile_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ProjectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ChatFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ChatFile_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChatFile_chatId_idx" ON "ChatFile"("chatId");
CREATE INDEX "ChatFile_messageId_idx" ON "ChatFile"("messageId");
