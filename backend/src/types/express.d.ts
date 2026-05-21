import type { UserType } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: {
        userId: string;
      };
      workspaceMember?: {
        workspaceId: string;
        userId: string;
        userType: UserType;
      };
    }
  }
}

export {};
