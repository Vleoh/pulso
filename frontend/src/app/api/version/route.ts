import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function shortCommit(input: string | null | undefined): string {
  const value = String(input ?? "").trim();
  return value ? value.slice(0, 7) : "dev";
}

export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    "dev-local";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || null;
  const deployment = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || null;
  const publicUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return NextResponse.json(
    {
      app: "frontend",
      provider: process.env.VERCEL ? "vercel" : "local",
      commit,
      branch,
      deployment,
      publicUrl,
      generatedAt: new Date().toISOString(),
      versionLabel: shortCommit(commit),
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  );
}
