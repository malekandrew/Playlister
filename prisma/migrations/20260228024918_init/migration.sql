-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePlaylist" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "xtreamHost" TEXT,
    "xtreamUsername" TEXT,
    "xtreamPassword" TEXT,
    "m3uUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncChannelCount" INTEGER,
    "lastSyncError" TEXT,
    "refreshIntervalMin" INTEGER NOT NULL DEFAULT 360,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcePlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "sourcePlaylistId" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "categoryType" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" SERIAL NOT NULL,
    "sourcePlaylistId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "groupTitle" TEXT,
    "tvgId" TEXT,
    "tvgName" TEXT,
    "tvgLogo" TEXT,
    "language" TEXT,
    "duration" INTEGER NOT NULL DEFAULT -1,
    "seriesName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sublist" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "xtreamUsername" TEXT NOT NULL,
    "xtreamPassword" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sublist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SublistCategory" (
    "sublistId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "SublistCategory_pkey" PRIMARY KEY ("sublistId","categoryId")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "refreshIntervalMin" INTEGER NOT NULL DEFAULT 360,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Category_sourcePlaylistId_categoryId_categoryType_key" ON "Category"("sourcePlaylistId", "categoryId", "categoryType");

-- CreateIndex
CREATE INDEX "Channel_sourcePlaylistId_idx" ON "Channel"("sourcePlaylistId");

-- CreateIndex
CREATE INDEX "Channel_categoryId_idx" ON "Channel"("categoryId");

-- CreateIndex
CREATE INDEX "Channel_groupTitle_idx" ON "Channel"("groupTitle");

-- CreateIndex
CREATE INDEX "Channel_tvgId_idx" ON "Channel"("tvgId");

-- CreateIndex
CREATE INDEX "Channel_seriesName_idx" ON "Channel"("seriesName");

-- CreateIndex
CREATE UNIQUE INDEX "Sublist_apiKey_key" ON "Sublist"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Sublist_xtreamUsername_key" ON "Sublist"("xtreamUsername");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_sourcePlaylistId_fkey" FOREIGN KEY ("sourcePlaylistId") REFERENCES "SourcePlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_sourcePlaylistId_fkey" FOREIGN KEY ("sourcePlaylistId") REFERENCES "SourcePlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SublistCategory" ADD CONSTRAINT "SublistCategory_sublistId_fkey" FOREIGN KEY ("sublistId") REFERENCES "Sublist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SublistCategory" ADD CONSTRAINT "SublistCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
