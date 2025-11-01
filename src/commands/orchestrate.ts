import { Command } from 'commander';
import { AccountManager, AccountConfig } from '../orchestration/account-manager.js';
import { SuperAgent, Task } from '../orchestration/super-agent.js';
import { OrchestrationDatabase } from '../storage/database.js';
import { PromptLibrary } from '../storage/prompt-library.js';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.supergrok', 'orchestration-config.json');

interface OrchestratorConfig {
  account1: {
    apiKey: string;
    name: string;
    maxConcurrent: number;
    rateLimit: number;
  };
  account2: {
    apiKey: string;
    name: string;
    maxConcurrent: number;
    rateLimit: number;
  };
  strategy: 'round-robin' | 'least-loaded' | 'cost-optimized';
  maxSubAgents: number;
  executionStrategy: 'parallel' | 'sequential' | 'adaptive';
}

export function createOrchestrateCommand(): Command {
  const orchestrate = new Command('orchestrate');

  orchestrate
    .description('Multi-agent orchestration across 2 SuperGrok accounts')
    .action(() => {
      orchestrate.help();
    });

  // Initialize configuration
  orchestrate
    .command('init')
    .description('Initialize orchestration with 2 API keys')
    .requiredOption('--account1-key <key>', 'API key for account 1')
    .requiredOption('--account2-key <key>', 'API key for account 2')
    .option('--account1-name <name>', 'Name for account 1', 'Primary')
    .option('--account2-name <name>', 'Name for account 2', 'Secondary')
    .option('--strategy <strategy>', 'Load balancing strategy', 'least-loaded')
    .option('--max-concurrent <number>', 'Max concurrent requests per account', '10')
    .option('--rate-limit <number>', 'Rate limit per minute per account', '60')
    .action(async (options) => {
      const config: OrchestratorConfig = {
        account1: {
          apiKey: options.account1Key,
          name: options.account1Name,
          maxConcurrent: parseInt(options.maxConcurrent),
          rateLimit: parseInt(options.rateLimit),
        },
        account2: {
          apiKey: options.account2Key,
          name: options.account2Name,
          maxConcurrent: parseInt(options.maxConcurrent),
          rateLimit: parseInt(options.rateLimit),
        },
        strategy: options.strategy,
        maxSubAgents: 5,
        executionStrategy: 'adaptive',
      };

      fs.ensureDirSync(path.dirname(CONFIG_PATH));
      fs.writeJSONSync(CONFIG_PATH, config, { spaces: 2 });

      console.log(chalk.green('✓ Orchestration initialized!'));
      console.log(chalk.blue(`  Config saved to: ${CONFIG_PATH}`));
      console.log(chalk.blue(`  Strategy: ${config.strategy}`));
      console.log(chalk.blue(`  Max concurrent per account: ${config.account1.maxConcurrent}`));
    });

  // Run a task with orchestration
  orchestrate
    .command('run')
    .description('Execute a task using multi-agent orchestration')
    .requiredOption('-t, --task <task>', 'Task description')
    .option('-c, --context <context>', 'Additional context for the task')
    .option('--complexity <level>', 'Task complexity: simple, medium, complex', 'medium')
    .option('--priority <number>', 'Task priority (1-5)', '3')
    .option('--sub-agents <number>', 'Max sub-agents to spawn', '5')
    .option('--strategy <strategy>', 'Execution strategy: parallel, sequential, adaptive', 'adaptive')
    .option('--no-save', 'Do not save conversation history')
    .action(async (options) => {
      try {
        const config = loadConfig();
        const { accountManager, database } = initializeOrchestration(config);

        console.log(chalk.blue('🚀 Starting multi-agent orchestration...'));
        console.log(chalk.gray(`   Task: ${options.task}`));
        console.log(chalk.gray(`   Strategy: ${options.strategy}`));
        console.log(chalk.gray(`   Max sub-agents: ${options.subAgents}`));
        console.log();

        // Create super agent
        const superAgent = new SuperAgent(accountManager, database, {
          maxSubAgents: parseInt(options.subAgents),
          strategy: options.strategy,
          saveHistory: options.save !== false,
        });

        // Create task
        const task: Task = {
          id: `task-${Date.now()}`,
          description: options.task,
          context: options.context,
          complexity: options.complexity,
          priority: parseInt(options.priority),
        };

        // Execute task
        const result = await superAgent.executeTask(task);

        // Display results
        console.log(chalk.green.bold('\n✓ Task completed!'));
        console.log(chalk.blue('━'.repeat(60)));
        console.log();
        console.log(result.result);
        console.log();
        console.log(chalk.blue('━'.repeat(60)));
        console.log(chalk.gray(`Duration: ${(result.duration / 1000).toFixed(2)}s`));
        console.log(chalk.gray(`Tokens used: ${result.tokensUsed.toLocaleString()}`));
        console.log(chalk.gray(`Estimated cost: $${result.cost.toFixed(4)}`));
        console.log(chalk.gray(`Sub-agents: ${result.subResults.length}`));

        // Show account usage
        const stats = accountManager.getAllStats();
        console.log();
        console.log(chalk.blue('Account Usage:'));
        console.log(chalk.gray(`  Account 1: ${stats.account1.totalRequests} requests, ${stats.account1.totalTokens.toLocaleString()} tokens, $${stats.account1.totalCost.toFixed(4)}`));
        console.log(chalk.gray(`  Account 2: ${stats.account2.totalRequests} requests, ${stats.account2.totalTokens.toLocaleString()} tokens, $${stats.account2.totalCost.toFixed(4)}`));

        database.close();
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Show statistics
  orchestrate
    .command('stats')
    .description('Show orchestration statistics')
    .action(async () => {
      const database = new OrchestrationDatabase();
      const stats = database.getStats();

      console.log(chalk.blue.bold('\n📊 Orchestration Statistics'));
      console.log(chalk.blue('━'.repeat(60)));
      console.log();
      console.log(chalk.white('Total Conversations:'), chalk.green(stats.totalConversations.toLocaleString()));
      console.log(chalk.white('Total Documents:'), chalk.green(stats.totalDocuments.toLocaleString()));
      console.log(chalk.white('Total Prompts:'), chalk.green(stats.totalPrompts.toLocaleString()));
      console.log(chalk.white('Total Agents:'), chalk.green(stats.totalAgents.toLocaleString()));
      console.log();
      console.log(chalk.white('Account Usage:'));
      console.log(chalk.gray(`  Account 1: ${stats.account1Usage} agents`));
      console.log(chalk.gray(`  Account 2: ${stats.account2Usage} agents`));

      database.close();
    });

  // Show conversation history
  orchestrate
    .command('history')
    .description('Show recent conversation history')
    .option('-l, --limit <number>', 'Number of conversations to show', '10')
    .action(async (options) => {
      const database = new OrchestrationDatabase();
      const conversations = database.getAllConversations(parseInt(options.limit));

      console.log(chalk.blue.bold('\n💬 Recent Conversations'));
      console.log(chalk.blue('━'.repeat(60)));
      console.log();

      for (const conv of conversations) {
        const time = new Date(conv.timestamp).toLocaleString();
        const color = conv.role === 'user' ? chalk.cyan : chalk.green;
        console.log(color.bold(`[${conv.role.toUpperCase()}]`), chalk.gray(time));
        console.log(chalk.gray(`  Account: ${conv.account}, Super Agent: ${conv.super_agent_id.substring(0, 8)}`));
        console.log(color(conv.content.substring(0, 200) + (conv.content.length > 200 ? '...' : '')));
        if (conv.tokens_used) {
          console.log(chalk.gray(`  Tokens: ${conv.tokens_used}, Cost: $${conv.cost?.toFixed(4) || '0.0000'}`));
        }
        console.log();
      }

      database.close();
    });

  return orchestrate;
}

function loadConfig(): OrchestratorConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(chalk.red('Error: Orchestration not initialized.'));
    console.error(chalk.yellow('Run: supergrok orchestrate init --account1-key KEY1 --account2-key KEY2'));
    process.exit(1);
  }

  return fs.readJSONSync(CONFIG_PATH);
}

function initializeOrchestration(config: OrchestratorConfig): {
  accountManager: AccountManager;
  database: OrchestrationDatabase;
} {
  const account1: AccountConfig = {
    apiKey: config.account1.apiKey,
    name: config.account1.name,
    maxConcurrent: config.account1.maxConcurrent,
    rateLimit: config.account1.rateLimit,
  };

  const account2: AccountConfig = {
    apiKey: config.account2.apiKey,
    name: config.account2.name,
    maxConcurrent: config.account2.maxConcurrent,
    rateLimit: config.account2.rateLimit,
  };

  const accountManager = new AccountManager(account1, account2, config.strategy);
  const database = new OrchestrationDatabase();

  return { accountManager, database };
}
