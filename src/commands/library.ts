import { Command } from 'commander';
import { PromptLibrary } from '../storage/prompt-library.js';
import { OrchestrationDatabase } from '../storage/database.js';
import chalk from 'chalk';

export function createLibraryCommand(): Command {
  const library = new Command('library');

  library
    .description('Manage the prompt library')
    .action(() => {
      library.help();
    });

  // List prompts
  library
    .command('list')
    .description('List all prompts in the library')
    .option('-c, --category <category>', 'Filter by category')
    .action((options) => {
      const database = new OrchestrationDatabase();
      const promptLibrary = new PromptLibrary(database);
      const prompts = promptLibrary.list(options.category);

      if (prompts.length === 0) {
        console.log(chalk.yellow('No prompts found.'));
        return;
      }

      console.log(chalk.blue.bold('\n📚 Prompt Library'));
      console.log(chalk.blue('━'.repeat(80)));
      console.log();

      for (const prompt of prompts) {
        console.log(chalk.cyan.bold(prompt.name));
        console.log(chalk.gray(`  Category: ${prompt.category}`));
        console.log(chalk.gray(`  Usage: ${prompt.usage_count} times`));
        if (prompt.description) {
          console.log(chalk.white(`  ${prompt.description}`));
        }
        console.log();
      }

      console.log(chalk.gray(`Total prompts: ${prompts.length}`));
      database.close();
    });

  // Search prompts
  library
    .command('search')
    .description('Search prompts by keyword')
    .argument('<query>', 'Search query')
    .action((query) => {
      const database = new OrchestrationDatabase();
      const promptLibrary = new PromptLibrary(database);
      const prompts = promptLibrary.search(query);

      if (prompts.length === 0) {
        console.log(chalk.yellow(`No prompts found matching "${query}"`));
        return;
      }

      console.log(chalk.blue.bold(`\n🔍 Search Results for "${query}"`));
      console.log(chalk.blue('━'.repeat(80)));
      console.log();

      for (const prompt of prompts) {
        console.log(chalk.cyan.bold(prompt.name));
        console.log(chalk.gray(`  Category: ${prompt.category}`));
        if (prompt.description) {
          console.log(chalk.white(`  ${prompt.description}`));
        }
        console.log();
      }

      console.log(chalk.gray(`Found ${prompts.length} prompt(s)`));
      database.close();
    });

  // Show a specific prompt
  library
    .command('show')
    .description('Display a prompt template')
    .argument('<name>', 'Prompt name')
    .action((name) => {
      const database = new OrchestrationDatabase();
      const promptLibrary = new PromptLibrary(database);
      const prompt = promptLibrary.get(name);

      if (!prompt) {
        console.log(chalk.red(`❌ Prompt "${name}" not found.`));
        process.exit(1);
      }

      const record = promptLibrary.list().find((p) => p.name === name);

      console.log(chalk.blue.bold('\n📄 Prompt Template'));
      console.log(chalk.blue('━'.repeat(80)));
      console.log();
      console.log(chalk.cyan.bold('Name:'), record?.name);
      console.log(chalk.cyan.bold('Category:'), record?.category);
      if (record?.description) {
        console.log(chalk.cyan.bold('Description:'), record.description);
      }
      console.log(chalk.cyan.bold('Usage Count:'), record?.usage_count);
      console.log();
      console.log(chalk.white('Template:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(chalk.white(prompt));
      console.log(chalk.gray('─'.repeat(80)));
      database.close();
    });

  // Save a new prompt
  library
    .command('save')
    .description('Save a new prompt template')
    .requiredOption('-n, --name <name>', 'Prompt name')
    .requiredOption('-c, --content <content>', 'Prompt template text')
    .option('--category <category>', 'Category (e.g., code-generation, analysis)', 'custom')
    .option('-d, --description <description>', 'Description of the prompt')
    .action((options) => {
      const database = new OrchestrationDatabase();
      const promptLibrary = new PromptLibrary(database);

      promptLibrary.save({
        name: options.name,
        content: options.content,
        category: options.category,
        description: options.description,
      });

      console.log(chalk.green(`✓ Prompt "${options.name}" saved to library!`));
      console.log(chalk.blue(`  Category: ${options.category}`));
      if (options.description) {
        console.log(chalk.blue(`  Description: ${options.description}`));
      }
      database.close();
    });

  // Use a prompt (render with variables)
  library
    .command('use')
    .description('Use a prompt template with variables')
    .argument('<name>', 'Prompt name')
    .option('-v, --vars <vars>', 'Variables in JSON format (e.g., \'{"code":"console.log()"}\')')
    .action((name, options) => {
      const database = new OrchestrationDatabase();
      const promptLibrary = new PromptLibrary(database);

      let variables: Record<string, string> = {};
      if (options.vars) {
        try {
          variables = JSON.parse(options.vars);
        } catch (error) {
          console.log(chalk.red('❌ Invalid JSON for variables. Use format: \'{"key":"value"}\''));
          process.exit(1);
        }
      }

      const rendered = promptLibrary.get(name, variables);

      if (!rendered) {
        console.log(chalk.red(`❌ Prompt "${name}" not found.`));
        process.exit(1);
      }

      console.log(chalk.blue.bold('\n📝 Rendered Prompt'));
      console.log(chalk.blue('━'.repeat(80)));
      console.log();
      console.log(chalk.white(rendered));
      console.log();
      console.log(chalk.blue('━'.repeat(80)));
      console.log(chalk.gray('Copy the above text to use with your agent.'));
      database.close();
    });

  // Initialize default prompts
  library
    .command('init')
    .description('Initialize library with default prompt templates')
    .action(() => {
      const database = new OrchestrationDatabase();
      const promptLibrary = new PromptLibrary(database);
      promptLibrary.initializeDefaults();

      console.log(chalk.green('✓ Prompt library initialized with default templates!'));
      console.log(chalk.blue('  Run "supergrok library list" to see available prompts.'));
      database.close();
    });

  return library;
}
