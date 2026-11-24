import { connection } from "next/server";
import { budgetStatus } from "@/lib/budget";

export async function GET() {
  await connection(); // always read the live ledger, never prerender
  return Response.json(budgetStatus());
}
