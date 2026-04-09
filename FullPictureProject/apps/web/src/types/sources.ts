export interface SourceInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  partition: string;
  requires_key: boolean;
  key_env_var: string | null;
  key_configured: boolean;
}

export interface SourceStats {
  source_id: string;
  has_data: boolean;
  count: number;
  start_date: string | null;
  end_date: string | null;
}

export interface PreviewResponse {
  source_id: string;
  rows: Record<string, unknown>[];
  count: number;
}

export interface DataResponse {
  source_id: string;
  rows: Record<string, unknown>[];
  count: number;
}

export interface RefreshRequest {
  start_date: string;
  end_date: string;
}

export interface RefreshResponse {
  status: string;
  source_id: string;
  start_date: string;
  end_date: string;
}
