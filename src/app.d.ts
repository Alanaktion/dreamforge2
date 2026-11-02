declare global {
  namespace App {
    interface User {
      id: string;
      email: string;
      username: string;
      passwordHash: string;
      mustChangePassword?: boolean;
      createdAt: string;
    }
    interface Session {
      id: string;
      userId: string;
      expiresAt: number;
    }
    interface Locals {
      user: User | null;
      session: Session | null;
    }
  }
}

export {};
