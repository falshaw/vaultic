import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Workbench from "@/components/Workbench";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <Workbench email={session.email} role={session.role} />;
}
