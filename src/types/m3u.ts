// M3U parse types

export interface M3UEntry {
  name: string;
  url: string;
  groupTitle: string;
  tvgId: string;
  tvgName: string;
  tvgLogo: string;
  language?: string;
  duration?: number;
}

export interface M3UParseResult {
  entries: M3UEntry[];
  errors: string[];
}
