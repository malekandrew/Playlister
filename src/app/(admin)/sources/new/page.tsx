import { SourceForm } from "@/components/admin/source-form";

export default function NewSourcePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add Source</h1>
        <p className="text-muted-foreground">
          Connect a new upstream IPTV provider
        </p>
      </div>
      <SourceForm />
    </div>
  );
}
