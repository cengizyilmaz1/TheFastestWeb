"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
      <div className="bg-bg-main border border-border rounded-[14px] p-8 max-w-[400px] w-full">
        <h1 className="font-display font-[800] text-2xl mb-2 text-center">
          Sign In
        </h1>
        <p className="text-text-secondary text-sm text-center mb-6">
          Sign in to submit and manage your sites
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="w-full py-3 rounded-[10px] bg-bg-card border border-border text-text-primary font-semibold text-sm cursor-pointer transition-all duration-200 hover:bg-bg-card-hover hover:border-border-light"
          >
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
