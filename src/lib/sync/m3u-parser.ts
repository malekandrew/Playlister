import type { M3UEntry, M3UParseResult } from "@/types/m3u";

/**
 * Parse an M3U/M3U8 playlist string into structured entries.
 * Supports #EXTINF tags with standard attributes (tvg-id, tvg-name, tvg-logo, group-title).
 */
export function parseM3U(content: string): M3UParseResult {
  const lines = content.split(/\r?\n/);
  const entries: M3UEntry[] = [];
  const errors: string[] = [];

  let currentEntry: Partial<M3UEntry> | null = null;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();

    // Skip empty lines and #EXTM3U header
    if (!trimmed || trimmed.startsWith("#EXTM3U")) {
      continue;
    }

    if (trimmed.startsWith("#EXTINF:")) {
      try {
        currentEntry = parseExtInf(trimmed);
      } catch (err) {
        errors.push(
          `Line ${lineNumber}: Failed to parse #EXTINF - ${err instanceof Error ? err.message : String(err)}`
        );
        currentEntry = null;
      }
      continue;
    }

    // Skip other directives
    if (trimmed.startsWith("#")) {
      continue;
    }

    // This is a URL line
    if (currentEntry) {
      entries.push({
        name: currentEntry.name || "Unknown",
        groupTitle: currentEntry.groupTitle || "Uncategorized",
        tvgId: currentEntry.tvgId || "",
        tvgName: currentEntry.tvgName || "",
        tvgLogo: currentEntry.tvgLogo || "",
        url: trimmed,
      });
      currentEntry = null;
    } else {
      // URL without preceding #EXTINF
      entries.push({
        name: "Unknown",
        groupTitle: "Uncategorized",
        tvgId: "",
        tvgName: "",
        tvgLogo: "",
        url: trimmed,
      });
    }
  }

  return { entries, errors };
}

/**
 * Parse a single #EXTINF line.
 * Example: #EXTINF:-1 tvg-id="ch1" tvg-name="Channel 1" tvg-logo="http://..." group-title="News",Channel 1
 */
function parseExtInf(line: string): Partial<M3UEntry> {
  // Remove the #EXTINF: prefix
  const content = line.substring(8);

  // Extract the display name (after the last comma that's not inside quotes)
  const name = extractDisplayName(content);

  // Extract attributes
  const tvgId = extractAttribute(content, "tvg-id");
  const tvgName = extractAttribute(content, "tvg-name");
  const tvgLogo = extractAttribute(content, "tvg-logo");
  const groupTitle = extractAttribute(content, "group-title");

  return {
    name: name || tvgName || "Unknown",
    groupTitle: groupTitle || "Uncategorized",
    tvgId: tvgId || "",
    tvgName: tvgName || "",
    tvgLogo: tvgLogo || "",
  };
}

/**
 * Extract the display name from an #EXTINF line content.
 * The name is the text after the last comma that's not inside quotes.
 */
function extractDisplayName(content: string): string {
  let inQuotes = false;
  let lastCommaIndex = -1;

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '"') {
      inQuotes = !inQuotes;
    } else if (content[i] === "," && !inQuotes) {
      lastCommaIndex = i;
    }
  }

  if (lastCommaIndex === -1) {
    return "";
  }

  return content.substring(lastCommaIndex + 1).trim();
}

/**
 * Extract a tag attribute value from an #EXTINF line.
 * Handles both quoted and unquoted values.
 */
function extractAttribute(content: string, attribute: string): string {
  // Try quoted value first: attribute="value"
  const quotedRegex = new RegExp(`${attribute}="([^"]*)"`, "i");
  const quotedMatch = content.match(quotedRegex);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  // Try unquoted value: attribute=value (until space or comma)
  const unquotedRegex = new RegExp(`${attribute}=([^\\s,]+)`, "i");
  const unquotedMatch = content.match(unquotedRegex);
  if (unquotedMatch) {
    return unquotedMatch[1];
  }

  return "";
}

/**
 * Fetch an M3U playlist from a URL and parse it.
 */
export async function fetchAndParseM3U(url: string): Promise<M3UParseResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60000), // 60 second timeout for large playlists
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch M3U playlist: ${response.status} ${response.statusText}`
    );
  }

  const content = await response.text();
  return parseM3U(content);
}

/**
 * Extract unique group titles from M3U entries.
 */
export function extractGroups(entries: M3UEntry[]): string[] {
  const groups = new Set<string>();
  for (const entry of entries) {
    if (entry.groupTitle) {
      groups.add(entry.groupTitle);
    }
  }
  return Array.from(groups).sort();
}
