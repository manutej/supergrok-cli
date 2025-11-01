import { v4 as uuidv4 } from 'uuid';
import { AccountManager } from './account-manager.js';
import { OrchestrationDatabase } from '../storage/database.js';
import { SubAgent, SubAgentTask, SubAgentResult } from './sub-agent.js';

export interface SuperAgentConfig {
  maxSubAgents: number;
  strategy: 'parallel' | 'sequential' | 'adaptive';
  saveHistory: boolean;
}

export interface Task {
  id: string;
  description: string;
  context?: string;
  complexity: 'simple' | 'medium' | 'complex';
  priority: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result: string;
  subResults: SubAgentResult[];
  tokensUsed: number;
  cost: number;
  duration: number;
}

export class SuperAgent {
  private id: string;
  private accountManager: AccountManager;
  private database: OrchestrationDatabase;
  private config: SuperAgentConfig;
  private activeSubAgents: Map<string, SubAgent> = new Map();

  constructor(
    accountManager: AccountManager,
    database: OrchestrationDatabase,
    config: SuperAgentConfig
  ) {
    this.id = uuidv4();
    this.accountManager = accountManager;
    this.database = database;
    this.config = config;

    // Register this super agent
    this.database.saveAgent({
      id: this.id,
      type: 'super',
      account: 'account1', // Super agent is meta-level
      status: 'active',
      task: 'Orchestrate multi-agent tasks',
      created_at: Date.now(),
    });
  }

  /**
   * Execute a complex task by breaking it down and delegating to sub-agents
   */
  async executeTask(task: Task): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      // Save initial task
      if (this.config.saveHistory) {
        this.database.saveConversation({
          id: uuidv4(),
          super_agent_id: this.id,
          account: 'account1',
          role: 'user',
          content: `Task: ${task.description}`,
          timestamp: Date.now(),
        });
      }

      // Break down task into sub-tasks
      const subTasks = await this.decomposeTask(task);

      // Execute sub-tasks based on strategy
      let subResults: SubAgentResult[];
      if (this.config.strategy === 'parallel') {
        subResults = await this.executeParallel(subTasks);
      } else if (this.config.strategy === 'sequential') {
        subResults = await this.executeSequential(subTasks);
      } else {
        subResults = await this.executeAdaptive(subTasks);
      }

      // Aggregate results
      const finalResult = await this.aggregateResults(task, subResults);

      // Calculate metrics
      const totalTokens = subResults.reduce((sum, r) => sum + r.tokensUsed, 0);
      const totalCost = subResults.reduce((sum, r) => sum + r.cost, 0);
      const duration = Date.now() - startTime;

      // Save final result
      if (this.config.saveHistory) {
        this.database.saveConversation({
          id: uuidv4(),
          super_agent_id: this.id,
          account: 'account1',
          role: 'assistant',
          content: finalResult,
          timestamp: Date.now(),
          tokens_used: totalTokens,
          cost: totalCost,
        });

        // Save as document
        this.database.saveDocument({
          id: uuidv4(),
          conversation_id: task.id,
          type: 'analysis',
          title: `Task Result: ${task.description.substring(0, 50)}...`,
          content: finalResult,
          format: 'markdown',
          created_at: Date.now(),
          tags: `complexity:${task.complexity},priority:${task.priority}`,
        });
      }

      // Update super agent status
      this.database.updateAgentStatus(this.id, 'completed', finalResult);

      return {
        taskId: task.id,
        success: true,
        result: finalResult,
        subResults,
        tokensUsed: totalTokens,
        cost: totalCost,
        duration,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.database.updateAgentStatus(this.id, 'failed', errorMsg);

      return {
        taskId: task.id,
        success: false,
        result: errorMsg,
        subResults: [],
        tokensUsed: 0,
        cost: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Break down a complex task into smaller sub-tasks
   */
  private async decomposeTask(task: Task): Promise<SubAgentTask[]> {
    // Use one of the accounts to analyze and decompose the task
    const { client, accountId } = this.accountManager.getClient();

    const decompositionPrompt = `
You are a task decomposition expert. Break down the following task into 3-5 smaller, actionable sub-tasks.

TASK: ${task.description}

${task.context ? `CONTEXT: ${task.context}` : ''}

COMPLEXITY: ${task.complexity}

Provide a JSON array of sub-tasks with this format:
[
  {
    "description": "Sub-task description",
    "priority": 1-5,
    "estimatedComplexity": "simple|medium|complex",
    "dependencies": []
  }
]

Only return the JSON array, no other text.
    `.trim();

    try {
      const response = await client.chat(
        [
          { role: 'system', content: 'You are a task decomposition expert. Output only valid JSON.' },
          { role: 'user', content: decompositionPrompt },
        ],
        undefined,
        'grok-3-fast'
      );

      const tokensUsed = response.usage?.total_tokens || 0;
      const cost = this.estimateCost(tokensUsed);
      this.accountManager.completeRequest(accountId, tokensUsed, cost);

      const content = response.choices[0]?.message?.content || '[]';
      const subTasksData = JSON.parse(content);

      return subTasksData.map((st: any, index: number) => ({
        id: uuidv4(),
        description: st.description,
        priority: st.priority || index + 1,
        parentTaskId: task.id,
        complexity: st.estimatedComplexity || 'medium',
      }));
    } catch (error) {
      console.error('Failed to decompose task:', error);
      // Fallback: create a single sub-task
      return [
        {
          id: uuidv4(),
          description: task.description,
          priority: 1,
          parentTaskId: task.id,
          complexity: task.complexity,
        },
      ];
    }
  }

  /**
   * Execute sub-tasks in parallel
   */
  private async executeParallel(subTasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const promises = subTasks.map((subTask) => this.spawnSubAgent(subTask));
    return await Promise.all(promises);
  }

  /**
   * Execute sub-tasks sequentially
   */
  private async executeSequential(subTasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const results: SubAgentResult[] = [];
    for (const subTask of subTasks) {
      const result = await this.spawnSubAgent(subTask);
      results.push(result);
    }
    return results;
  }

  /**
   * Execute sub-tasks adaptively (parallel for simple, sequential for complex)
   */
  private async executeAdaptive(subTasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const simpleTask = subTasks.filter((t) => t.complexity === 'simple');
    const complexTasks = subTasks.filter((t) => t.complexity !== 'simple');

    // Execute simple tasks in parallel
    const simpleResults = await Promise.all(
      simpleTask.map((t) => this.spawnSubAgent(t))
    );

    // Execute complex tasks sequentially
    const complexResults: SubAgentResult[] = [];
    for (const task of complexTasks) {
      const result = await this.spawnSubAgent(task);
      complexResults.push(result);
    }

    return [...simpleResults, ...complexResults];
  }

  /**
   * Spawn a sub-agent to handle a specific task
   */
  private async spawnSubAgent(task: SubAgentTask): Promise<SubAgentResult> {
    const subAgent = new SubAgent(
      task,
      this.accountManager,
      this.database,
      this.id
    );

    this.activeSubAgents.set(task.id, subAgent);

    try {
      const result = await subAgent.execute();
      this.activeSubAgents.delete(task.id);
      return result;
    } catch (error) {
      this.activeSubAgents.delete(task.id);
      throw error;
    }
  }

  /**
   * Aggregate results from all sub-agents
   */
  private async aggregateResults(
    originalTask: Task,
    subResults: SubAgentResult[]
  ): Promise<string> {
    // Use one account to synthesize all sub-results
    const { client, accountId } = this.accountManager.getClient();

    const subResultsText = subResults
      .map(
        (r, i) => `
### Sub-Task ${i + 1}
**Task:** ${r.taskId}
**Success:** ${r.success}
**Result:**
${r.result}
    `
      )
      .join('\n\n');

    const aggregationPrompt = `
You are a synthesis expert. Combine the following sub-task results into a comprehensive, cohesive response to the original task.

ORIGINAL TASK: ${originalTask.description}

SUB-TASK RESULTS:
${subResultsText}

Provide a well-structured, comprehensive response that:
1. Addresses the original task completely
2. Integrates all sub-task findings
3. Highlights key insights
4. Provides actionable recommendations if applicable

Format your response in clear, professional markdown.
    `.trim();

    try {
      const response = await client.chat(
        [
          { role: 'system', content: 'You are a synthesis expert who combines multiple analysis results into cohesive insights.' },
          { role: 'user', content: aggregationPrompt },
        ],
        undefined,
        'grok-4'
      );

      const tokensUsed = response.usage?.total_tokens || 0;
      const cost = this.estimateCost(tokensUsed);
      this.accountManager.completeRequest(accountId, tokensUsed, cost);

      return response.choices[0]?.message?.content || 'Failed to aggregate results';
    } catch (error) {
      console.error('Failed to aggregate results:', error);
      return subResultsText;
    }
  }

  /**
   * Estimate cost based on tokens (rough estimate)
   */
  private estimateCost(tokens: number): number {
    // Rough estimate: $0.01 per 1K tokens (adjust based on actual pricing)
    return (tokens / 1000) * 0.01;
  }

  /**
   * Get super agent ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get active sub-agents count
   */
  getActiveSubAgentsCount(): number {
    return this.activeSubAgents.size;
  }

  /**
   * Get all sub-agent results from database
   */
  getSubAgentHistory(): any[] {
    return this.database.getSubAgents(this.id);
  }
}
