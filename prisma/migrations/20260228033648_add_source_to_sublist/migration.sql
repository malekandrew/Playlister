/*
  Warnings:

  - Added the required column `sourcePlaylistId` to the `Sublist` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Sublist" ADD COLUMN     "sourcePlaylistId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Sublist" ADD CONSTRAINT "Sublist_sourcePlaylistId_fkey" FOREIGN KEY ("sourcePlaylistId") REFERENCES "SourcePlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
