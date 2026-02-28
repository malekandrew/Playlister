import { db } from "@/lib/db";

/**
 * Authenticate an Xtream API request by username + password.
 * Returns the sublist if valid, or null.
 */
export async function authenticateXtream(
  username: string,
  password: string
) {
  const sublist = await db.sublist.findUnique({
    where: { xtreamUsername: username },
  });

  if (!sublist || sublist.xtreamPassword !== password || !sublist.isEnabled) {
    return null;
  }

  // Update last used timestamp
  await db.sublist.update({
    where: { id: sublist.id },
    data: { lastUsedAt: new Date() },
  });

  return sublist;
}
