import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { GEN_MODEL } from "@/lib/ollama";
import Shell from "@/components/Shell";
import Workbench from "@/components/Workbench";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workbench" };

export default async function WorkbenchPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <Shell email={session.email} role={session.role}>
      <Workbench isAdmin={session.role === "admin"} model={GEN_MODEL} />
    </Shell>
  );
}
