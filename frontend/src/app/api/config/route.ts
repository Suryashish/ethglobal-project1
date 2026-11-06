import { handle } from "@/lib/server/errors";
import { publicConfig } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => Response.json(publicConfig()));
