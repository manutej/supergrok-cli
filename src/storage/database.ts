import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

export interface ConversationRecord {
  id: string;
  super_agent_id: string;
  sub_agent_id?: string;
  account: 'account1' | 'account2';
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens_used?: number;
  cost?: number;
  metadata?: string;
}

export interface DocumentRecord {
  id: string;
  conversation_id: string;
  type: 'code' | 'document' | 'analysis' | 'plan';
  title: string;
  content: string;
  format: 'markdown' | 'json' | 'text';
  created_at: number;
  tags?: string;
}

export interface PromptRecord {
  id: string;
  name: string;
  category: string;
  content: string;
  variables?: string;
  description?: string;
  usage_count: number;
  created_at: number;
  updated_at: number;
}

export interface AgentRecord {
  id: string;
  type: 'super' | 'sub';
  parent_id?: string;
  account: 'account1' | 'account2';
  status: 'active' | 'completed' | 'failed';
  task: string;
  result?: string;
  created_at: number;
  completed_at?: number;
}

export class OrchestrationDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    const defaultPath = path.join(os.homedir(), '.supergrok', 'orchestration.db');
    this.dbPath = dbPath || defaultPath;

    // Ensure directory exists
    fs.ensureDirSync(path.dirname(this.dbPath));

    this.db = new Database(this.dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        super_agent_id TEXT NOT NULL,
        sub_agent_id TEXT,
        account TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tokens_used INTEGER,
        cost REAL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        format TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tags TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        variables TEXT,
        description TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        account TEXT NOT NULL,
        status TEXT NOT NULL,
        task TEXT NOT NULL,
        result TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_super_agent ON conversations(super_agent_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_documents_conversation ON documents(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
      CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    `);
  }

  // Conversation methods
  saveConversation(record: ConversationRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, super_agent_id, sub_agent_id, account, role, content, timestamp, tokens_used, cost, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.id,
      record.super_agent_id,
      record.sub_agent_id || null,
      record.account,
      record.role,
      record.content,
      record.timestamp,
      record.tokens_used || null,
      record.cost || null,
      record.metadata || null
    );
  }

  getConversationHistory(superAgentId: string, limit = 100): ConversationRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations
      WHERE super_agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(superAgentId, limit) as ConversationRecord[];
  }

  getAllConversations(limit = 50): ConversationRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit) as ConversationRecord[];
  }

  // Document methods
  saveDocument(record: DocumentRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO documents (id, conversation_id, type, title, content, format, created_at, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.id,
      record.conversation_id,
      record.type,
      record.title,
      record.content,
      record.format,
      record.created_at,
      record.tags || null
    );
  }

  getDocuments(conversationId: string): DocumentRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM documents
      WHERE conversation_id = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(conversationId) as DocumentRecord[];
  }

  searchDocuments(query: string, limit = 20): DocumentRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM documents
      WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const searchPattern = `%${query}%`;
    return stmt.all(searchPattern, searchPattern, searchPattern, limit) as DocumentRecord[];
  }

  // Prompt library methods
  savePrompt(record: Omit<PromptRecord, 'usage_count' | 'created_at' | 'updated_at'>): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO prompts (id, name, category, content, variables, description, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        content = excluded.content,
        variables = excluded.variables,
        description = excluded.description,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      record.id,
      record.name,
      record.category,
      record.content,
      record.variables || null,
      record.description || null,
      now,
      now
    );
  }

  getPrompt(name: string): PromptRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM prompts WHERE name = ?');
    const result = stmt.get(name) as PromptRecord | undefined;

    if (result) {
      // Increment usage count
      const updateStmt = this.db.prepare('UPDATE prompts SET usage_count = usage_count + 1 WHERE name = ?');
      updateStmt.run(name);
    }

    return result;
  }

  listPrompts(category?: string): PromptRecord[] {
    if (category) {
      const stmt = this.db.prepare('SELECT * FROM prompts WHERE category = ? ORDER BY usage_count DESC');
      return stmt.all(category) as PromptRecord[];
    } else {
      const stmt = this.db.prepare('SELECT * FROM prompts ORDER BY usage_count DESC');
      return stmt.all() as PromptRecord[];
    }
  }

  searchPrompts(query: string): PromptRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM prompts
      WHERE name LIKE ? OR description LIKE ? OR content LIKE ?
      ORDER BY usage_count DESC
      LIMIT 20
    `);
    const searchPattern = `%${query}%`;
    return stmt.all(searchPattern, searchPattern, searchPattern) as PromptRecord[];
  }

  deletePrompt(name: string): void {
    const stmt = this.db.prepare('DELETE FROM prompts WHERE name = ?');
    stmt.run(name);
  }

  // Agent tracking methods
  saveAgent(record: AgentRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO agents (id, type, parent_id, account, status, task, result, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.id,
      record.type,
      record.parent_id || null,
      record.account,
      record.status,
      record.task,
      record.result || null,
      record.created_at,
      record.completed_at || null
    );
  }

  updateAgentStatus(id: string, status: 'active' | 'completed' | 'failed', result?: string): void {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = ?, result = ?, completed_at = ?
      WHERE id = ?
    `);
    const completedAt = (status === 'completed' || status === 'failed') ? Date.now() : null;
    stmt.run(status, result || null, completedAt, id);
  }

  getAgent(id: string): AgentRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    return stmt.get(id) as AgentRecord | undefined;
  }

  getSubAgents(parentId: string): AgentRecord[] {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE parent_id = ? ORDER BY created_at ASC');
    return stmt.all(parentId) as AgentRecord[];
  }

  getActiveAgents(): AgentRecord[] {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE status = ? ORDER BY created_at DESC');
    return stmt.all('active') as AgentRecord[];
  }

  // Statistics
  getStats(): {
    totalConversations: number;
    totalDocuments: number;
    totalPrompts: number;
    totalAgents: number;
    account1Usage: number;
    account2Usage: number;
  } {
    const conversations = this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };
    const documents = this.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    const prompts = this.db.prepare('SELECT COUNT(*) as count FROM prompts').get() as { count: number };
    const agents = this.db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
    const account1 = this.db.prepare('SELECT COUNT(*) as count FROM agents WHERE account = ?').get('account1') as { count: number };
    const account2 = this.db.prepare('SELECT COUNT(*) as count FROM agents WHERE account = ?').get('account2') as { count: number };

    return {
      totalConversations: conversations.count,
      totalDocuments: documents.count,
      totalPrompts: prompts.count,
      totalAgents: agents.count,
      account1Usage: account1.count,
      account2Usage: account2.count,
    };
  }

  close(): void {
    this.db.close();
  }
}
