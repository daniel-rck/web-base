import { Sparkles } from "lucide-react";
import { useDocumentTitle } from "../../lib/routing/useDocumentTitle.ts";
import { EmptyState, PageHeader } from "../../lib/ui/index.ts";

export function HomePage() {
  useDocumentTitle("Start");
  return (
    <>
      <PageHeader title="Start" />
      <EmptyState
        icon={<Sparkles className="h-10 w-10" />}
        title="Hier entsteht deine App"
        description="Lege Features unter src/features/ an und trage ihre Routen in src/lib/router.tsx ein."
      />
    </>
  );
}
