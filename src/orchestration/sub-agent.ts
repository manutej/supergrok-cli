import { v4 as uuidv4 } from 'uuid';
import { AccountManager } from './account-manager.js';
import { OrchestrationDatabase } from '../storage/database.js';

export interface SubAgentTask {
  id: string;
  description: string;
  priority: number;
  parentTaskId: string;
  complexity: 'simple' | 'medium' | 'complex';
  context?: string;
}

export interface SubAgentResult {
  taskId: string;
  success: boolean;
  result: string;
  tokensUsed: number;
  cost: number;
  account: 'account1' | 'account2';
  duration: number;
  error?: string;
}

export class SubAgent {
  private id: string;
  private task: SubAgentTask;
  private accountManager: AccountManager;
  private database: OrchestrationDatabase;
  private superAgentId: string;

  constructor(
    task: SubAgentTask,
    accountManager: AccountManager,
    database: OrchestrationDatabase,
    superAgentId: string
  ) {
    this.id = uuidv4();
    this.task = task;
    this.accountManager = accountManager;
    this.database = database;
    this.superAgentId = superAgentId;
  }

  /**
   * Execute the sub-task
   */
  async execute(): Promise<SubAgentResult> {
    const startTime = Date.now();

    // Wait if both accounts are rate limited
    await this.accountManager.waitForAvailability();

    // Get best account for this task
    const { client, accountId } = this.accountManager.getClient();

    // Register this sub-agent
    this.database.saveAgent({
      id: this.id,
      type: 'sub',
      parent_id: this.superAgentId,
      account: accountId,
      status: 'active',
      task: this.task.description,
      created_at: Date.now(),
    });

    try {
      // Select model based on complexity
      const model = this.selectModel(this.task.complexity);

      // Build prompt
      const prompt = this.buildPrompt();

      // Save conversation start
      this.database.saveConversation({
        id: uuidv4(),
        super_agent_id: this.superAgentId,
        sub_agent_id: this.id,
        account: accountId,
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      });

      // Execute task
      const response = await client.chat(
        [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        undefined,
        model
      );

      const result = response.choices[0]?.message?.content || 'No response';
      const tokensUsed = response.usage?.total_tokens || 0;
      const cost = this.estimateCost(tokensUsed, model);

      // Update account manager
      this.accountManager.completeRequest(accountId, tokensUsed, cost);

      // Save response
      this.database.saveConversation({
        id: uuidv4(),
        super_agent_id: this.superAgentId,
        sub_agent_id: this.id,
        account: accountId,
        role: 'assistant',
        content: result,
        timestamp: Date.now(),
        tokens_used: tokensUsed,
        cost,
      });

      // Update agent status
      this.database.updateAgentStatus(this.id, 'completed', result);

      const duration = Date.now() - startTime;

      return {
        taskId: this.task.id,
        success: true,
        result,
        tokensUsed,
        cost,
        account: accountId,
        duration,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // Update agent status
      this.database.updateAgentStatus(this.id, 'failed', errorMsg);

      // Still complete the request for accounting
      this.accountManager.completeRequest(accountId, 0, 0);

      return {
        taskId: this.task.id,
        success: false,
        result: '',
        tokensUsed: 0,
        cost: 0,
        account: accountId,
        duration: Date.now() - startTime,
        error: errorMsg,
      };
    }
  }

  /**
   * Select appropriate model based on task complexity
   */
  private selectModel(complexity: 'simple' | 'medium' | 'complex'): string {
    switch (complexity) {
      case 'simple':
        return 'grok-code-fast-1'; // Fast and cheap for simple tasks
      case 'medium':
        return 'grok-3-fast'; // Balanced
      case 'complex':
        return 'grok-4'; // Most capable for complex reasoning
      default:
        return 'grok-3-fast';
    }
  }

  /**
   * Get system prompt for sub-agent
   */
  private getSystemPrompt(): string {
    return `You are a specialized sub-agent working on a specific task as part of a larger multi-agent system.

Your role:
- Focus on completing your specific assigned task thoroughly
- Provide detailed, actionable results
- Be precise and comprehensive
- Structure your response clearly with markdown
- If you encounter issues, explain them clearly

Task Priority: ${this.task.priority}/5
Task Complexity: ${this.task.complexity}`;
  }

  /**
   * Build the prompt for this specific task
   */
  private buildPrompt(): string {
    let prompt = `TASK: ${this.task.description}\n\n`;

    if (this.task.context) {
      prompt += `CONTEXT:\n${this.task.context}\n\n`;
    }

    prompt += `Please complete this task thoroughly and provide a detailed response.`;

    return prompt;
  }

  /**
   * Get temperature based on complexity
   */
  private getTemperature(complexity: 'simple' | 'medium' | 'complex'): number {
    switch (complexity) {
      case 'simple':
        return 0.3; // More deterministic for simple tasks
      case 'medium':
        return 0.5;
      case 'complex':
        return 0.7; // More creative for complex tasks
      default:
        return 0.5;
    }
  }

  /**
   * Get max tokens based on complexity
   */
  private getMaxTokens(complexity: 'simple' | 'medium' | 'complex'): number {
    switch (complexity) {
      case 'simple':
        return 1000;
      case 'medium':
        return 2000;
      case 'complex':
        return 4000;
      default:
        return 2000;
    }
  }

  /**
   * Estimate cost based on tokens and model
   */
  private estimateCost(tokens: number, model: string): number {
    // Rough estimates (adjust based on actual pricing)
    const costPerThousand: Record<string, number> = {
      'grok-code-fast-1': 0.005,
      'grok-3-fast': 0.008,
      'grok-4': 0.015,
    };

    const rate = costPerThousand[model] || 0.01;
    return (tokens / 1000) * rate;
  }

  /**
   * Get sub-agent ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get task details
   */
  getTask(): SubAgentTask {
    return { ...this.task };
  }
}
