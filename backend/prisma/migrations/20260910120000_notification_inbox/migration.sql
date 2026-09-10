ALTER TABLE "ActivityLog" ADD COLUMN "pushProcessedAt" TIMESTAMP(3);
ALTER TABLE "ActivityLog" ADD COLUMN "pushNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "pushAttempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pushLastError" TEXT;
UPDATE "ActivityLog" SET "pushProcessedAt" = CURRENT_TIMESTAMP;
CREATE INDEX "ActivityLog_pushProcessedAt_createdAt_idx" ON "ActivityLog"("pushProcessedAt", "createdAt");
CREATE TABLE "NotificationRead" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "activityId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotificationRead_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ActivityLog"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationRead_userId_activityId_key" ON "NotificationRead"("userId", "activityId");
CREATE INDEX "NotificationRead_activityId_idx" ON "NotificationRead"("activityId");
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "endpoint" TEXT NOT NULL, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
