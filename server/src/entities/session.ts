export interface SessionRow {
  id: string;
  created_at: Date;
}

export interface ParagraphRow {
  id: string;
  session_id: string;
  content: string;
  created_at: Date;
}

export interface SessionListItem {
  id: string;
  created_at: Date;
  paragraph_count: number;
  list_title: string;
  preview: string;
}
