import { v4 as uuidv4 } from 'uuid';
import { OrchestrationDatabase, PromptRecord } from './database.js';

export interface PromptTemplate {
  name: string;
  category: string;
  content: string;
  variables?: string[];
  description?: string;
}

export class PromptLibrary {
  private database: OrchestrationDatabase;

  constructor(database: OrchestrationDatabase) {
    this.database = database;
  }

  /**
   * Save a prompt template
   */
  save(template: PromptTemplate): void {
    this.database.savePrompt({
      id: uuidv4(),
      name: template.name,
      category: template.category,
      content: template.content,
      variables: template.variables ? JSON.stringify(template.variables) : undefined,
      description: template.description,
    });
  }

  /**
   * Get a prompt by name and optionally fill in variables
   */
  get(name: string, variables?: Record<string, string>): string | null {
    const prompt = this.database.getPrompt(name);
    if (!prompt) return null;

    let content = prompt.content;

    // Replace variables if provided
    if (variables && prompt.variables) {
      const vars = JSON.parse(prompt.variables);
      for (const varName of vars) {
        if (variables[varName]) {
          content = content.replace(
            new RegExp(`{{${varName}}}`, 'g'),
            variables[varName]
          );
        }
      }
    }

    return content;
  }

  /**
   * List all prompts, optionally filtered by category
   */
  list(category?: string): PromptRecord[] {
    return this.database.listPrompts(category);
  }

  /**
   * Search prompts by keyword
   */
  search(query: string): PromptRecord[] {
    return this.database.searchPrompts(query);
  }

  /**
   * Delete a prompt
   */
  delete(name: string): void {
    this.database.deletePrompt(name);
  }

  /**
   * Get popular prompts (most used)
   */
  getPopular(limit: number = 10): PromptRecord[] {
    const all = this.database.listPrompts();
    return all
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, limit);
  }

  /**
   * Get prompts by category with stats
   */
  getByCategory(): Record<string, PromptRecord[]> {
    const all = this.database.listPrompts();
    const byCategory: Record<string, PromptRecord[]> = {};

    for (const prompt of all) {
      if (!byCategory[prompt.category]) {
        byCategory[prompt.category] = [];
      }
      byCategory[prompt.category].push(prompt);
    }

    return byCategory;
  }

  /**
   * Initialize library with default prompts
   */
  initializeDefaults(): void {
    const defaults: PromptTemplate[] = [
      {
        name: 'code-review',
        category: 'development',
        description: 'Comprehensive code review template',
        content: `Review the following code for:
1. Code quality and best practices
2. Potential bugs or security issues
3. Performance optimizations
4. Readability and maintainability

CODE:
{{code}}

Provide specific, actionable feedback.`,
        variables: ['code'],
      },
      {
        name: 'documentation-generator',
        category: 'development',
        description: 'Generate documentation from code',
        content: `Generate comprehensive documentation for the following code:

{{code}}

Include:
- Overview and purpose
- Function/method descriptions
- Parameters and return values
- Usage examples
- Edge cases and limitations`,
        variables: ['code'],
      },
      {
        name: 'task-breakdown',
        category: 'planning',
        description: 'Break down complex tasks',
        content: `Break down the following task into specific, actionable sub-tasks:

TASK: {{task}}

${'{'}context ? "CONTEXT: {{context}}" : ""}

Provide 3-5 sub-tasks with:
- Clear descriptions
- Priority levels
- Estimated complexity
- Dependencies`,
        variables: ['task', 'context'],
      },
      {
        name: 'bug-analysis',
        category: 'debugging',
        description: 'Analyze and suggest fixes for bugs',
        content: `Analyze the following bug and suggest fixes:

BUG DESCRIPTION:
{{description}}

ERROR MESSAGE:
{{error}}

RELEVANT CODE:
{{code}}

Provide:
1. Root cause analysis
2. Step-by-step fix
3. Prevention strategies
4. Test cases`,
        variables: ['description', 'error', 'code'],
      },
      {
        name: 'architecture-review',
        category: 'architecture',
        description: 'Review system architecture',
        content: `Review the following architecture and provide feedback:

SYSTEM DESCRIPTION:
{{description}}

COMPONENTS:
{{components}}

Analyze:
1. Design patterns used
2. Scalability concerns
3. Security considerations
4. Potential improvements
5. Trade-offs and alternatives`,
        variables: ['description', 'components'],
      },
      {
        name: 'test-generator',
        category: 'testing',
        description: 'Generate test cases',
        content: `Generate comprehensive test cases for:

{{code}}

Include:
- Unit tests
- Edge cases
- Error conditions
- Integration scenarios
- Mock requirements`,
        variables: ['code'],
      },
      {
        name: 'refactoring-suggestions',
        category: 'development',
        description: 'Suggest refactoring improvements',
        content: `Suggest refactoring improvements for:

{{code}}

Focus on:
1. Code smell identification
2. Design pattern opportunities
3. Performance improvements
4. Maintainability enhancements
5. Specific refactoring steps`,
        variables: ['code'],
      },
      {
        name: 'api-design',
        category: 'architecture',
        description: 'Design RESTful APIs',
        content: `Design a RESTful API for:

REQUIREMENTS:
{{requirements}}

Provide:
1. Endpoint definitions
2. Request/response formats
3. Authentication approach
4. Error handling
5. Versioning strategy
6. Documentation structure`,
        variables: ['requirements'],
      },
    ];

    for (const template of defaults) {
      try {
        this.save(template);
      } catch (error) {
        // Ignore if already exists
        console.log(`Skipping existing prompt: ${template.name}`);
      }
    }
  }
}
