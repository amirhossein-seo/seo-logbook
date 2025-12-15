import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUrls } from "@/app/actions";
import { UrlInventory } from "@/components/url-inventory";

export default async function ProjectUrlsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const urls = await getUrls(resolvedParams.projectId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">URLs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inventory of tracked pages for this project
        </p>
      </div>

      <UrlInventory urls={urls} projectId={resolvedParams.projectId} />
    </div>
  );
}


