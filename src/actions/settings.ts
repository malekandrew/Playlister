"use server";

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { revalidatePath } from "next/cache";

export async function getAppSettings() {
  const settings = await db.appSettings.findUnique({ where: { id: 1 } });
  return settings;
}

export async function updateAppSettings(data: { refreshIntervalMin: number }) {
  await db.appSettings.upsert({
    where: { id: 1 },
    create: { refreshIntervalMin: data.refreshIntervalMin },
    update: { refreshIntervalMin: data.refreshIntervalMin },
  });
  revalidatePath("/settings");
  return { success: true };
}

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  if (!data.newPassword || data.newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  // Get the admin user
  const admin = await db.adminUser.findFirst();
  if (!admin) {
    throw new Error("Admin user not found");
  }

  // Verify current password
  const valid = await verifyPassword(data.currentPassword, admin.passwordHash);
  if (!valid) {
    throw new Error("Current password is incorrect");
  }

  // Hash and update
  const newHash = await hashPassword(data.newPassword);
  await db.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: newHash },
  });

  return { success: true };
}
