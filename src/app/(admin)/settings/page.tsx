import { getAppSettings } from "@/actions/settings";
import { SettingsForm } from "@/components/admin/settings-form";
import { ChangePasswordForm } from "@/components/admin/change-password-form";

export default async function SettingsPage() {
  const settings = await getAppSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your Playlister instance
        </p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <SettingsForm
          refreshIntervalMin={settings?.refreshIntervalMin ?? 360}
        />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
