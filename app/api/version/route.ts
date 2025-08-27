// app/api/version/route.ts
import { NextResponse } from "next/server";
import pkg from "../../../package.json"; // TS 里可开 resolveJsonModule
export const revalidate = 0;
export async function GET() {
  return NextResponse.json({
    version: pkg.version,
    commit: process.env.NEXT_PUBLIC_GIT_SHA || "dev",
    buildAt: process.env.BUILD_TIME || "",
  });
}
