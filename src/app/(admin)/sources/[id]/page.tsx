import { notFound } from "next/navigation";
import { getSource } from "@/actions/sources";
import { SourceForm } from "@/components/admin/source-form";

export default async function EditSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const source = await getSource(parseInt(id));

  if (!source) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Source</h1>
        <p className="text-muted-foreground">
          Update {source.name} settings
        </p>
      </div>
      <SourceForm source={source} />
    </div>
  );
}
