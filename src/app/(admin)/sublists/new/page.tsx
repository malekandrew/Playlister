import { SublistForm } from "@/components/admin/sublist-form";
import { getSources } from "@/actions/sublists";

export default async function NewSublistPage() {
  const sources = await getSources();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Sublist</h1>
        <p className="text-muted-foreground">
          Create a new output playlist for consumers
        </p>
      </div>
      <SublistForm sources={sources} />
    </div>
  );
}
