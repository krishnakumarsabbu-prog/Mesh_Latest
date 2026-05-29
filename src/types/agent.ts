export interface ToolTrace {
  id: string;
  agent: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
  duration_ms?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestions?: string[];
  is_streaming?: boolean;
  is_error?: boolean;
  response_time_ms?: number;
  messageId?: string;
  activeAgents?: string[];
  toolTraces?: ToolTrace[];
  agents_used?: string[];
  tools_executed?: number;
}

export interface ChatSession {
  id: string;
  user_id: string;
  tenant_id: string;
  project_id?: string;
  title?: string;
  status: 'active' | 'archived' | 'deleted';
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  is_streaming: boolean;
  is_error: boolean;
  finish_reason?: string;
  response_time_ms?: number;
  created_at: string;
}
