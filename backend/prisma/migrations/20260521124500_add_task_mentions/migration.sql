CREATE TABLE "TaskMention" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mentionedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskMention_taskId_userId_key" ON "TaskMention"("taskId", "userId");
CREATE INDEX "TaskMention_taskId_idx" ON "TaskMention"("taskId");
CREATE INDEX "TaskMention_userId_idx" ON "TaskMention"("userId");
CREATE INDEX "TaskMention_mentionedById_idx" ON "TaskMention"("mentionedById");

ALTER TABLE "TaskMention"
  ADD CONSTRAINT "TaskMention_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskMention"
  ADD CONSTRAINT "TaskMention_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
