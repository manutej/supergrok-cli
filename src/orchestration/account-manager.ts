import { GrokClient } from '../grok/client.js';

export interface AccountConfig {
  apiKey: string;
  baseURL?: string;
  name: string;
  maxConcurrent: number;
  rateLimit: number; // requests per minute
}

export interface AccountStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  activeRequests: number;
  lastUsed: number;
}

export class AccountManager {
  private accounts: Map<string, {
    config: AccountConfig;
    client: GrokClient;
    stats: AccountStats;
    requestTimestamps: number[];
  }>;

  private strategy: 'round-robin' | 'least-loaded' | 'cost-optimized';
  private currentAccountIndex: number = 0;

  constructor(
    account1: AccountConfig,
    account2: AccountConfig,
    strategy: 'round-robin' | 'least-loaded' | 'cost-optimized' = 'least-loaded'
  ) {
    this.strategy = strategy;
    this.accounts = new Map();

    // Initialize account 1
    this.accounts.set('account1', {
      config: account1,
      client: new GrokClient(account1.apiKey, account1.baseURL),
      stats: {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        activeRequests: 0,
        lastUsed: 0,
      },
      requestTimestamps: [],
    });

    // Initialize account 2
    this.accounts.set('account2', {
      config: account2,
      client: new GrokClient(account2.apiKey, account2.baseURL),
      stats: {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        activeRequests: 0,
        lastUsed: 0,
      },
      requestTimestamps: [],
    });
  }

  /**
   * Get the best account to use based on strategy
   */
  selectAccount(): 'account1' | 'account2' {
    switch (this.strategy) {
      case 'round-robin':
        return this.selectRoundRobin();
      case 'least-loaded':
        return this.selectLeastLoaded();
      case 'cost-optimized':
        return this.selectCostOptimized();
      default:
        return 'account1';
    }
  }

  private selectRoundRobin(): 'account1' | 'account2' {
    const accounts = ['account1', 'account2'] as const;
    const selected = accounts[this.currentAccountIndex % 2];
    this.currentAccountIndex++;
    return selected;
  }

  private selectLeastLoaded(): 'account1' | 'account2' {
    const account1 = this.accounts.get('account1')!;
    const account2 = this.accounts.get('account2')!;

    // Check rate limits first
    if (this.isRateLimited('account1') && !this.isRateLimited('account2')) {
      return 'account2';
    }
    if (this.isRateLimited('account2') && !this.isRateLimited('account1')) {
      return 'account1';
    }

    // Select based on active requests
    return account1.stats.activeRequests <= account2.stats.activeRequests
      ? 'account1'
      : 'account2';
  }

  private selectCostOptimized(): 'account1' | 'account2' {
    const account1 = this.accounts.get('account1')!;
    const account2 = this.accounts.get('account2')!;

    // Check rate limits
    if (this.isRateLimited('account1') && !this.isRateLimited('account2')) {
      return 'account2';
    }
    if (this.isRateLimited('account2') && !this.isRateLimited('account1')) {
      return 'account1';
    }

    // Select based on total cost (use account with lower cost)
    return account1.stats.totalCost <= account2.stats.totalCost
      ? 'account1'
      : 'account2';
  }

  /**
   * Check if an account is rate limited
   */
  private isRateLimited(accountId: 'account1' | 'account2'): boolean {
    const account = this.accounts.get(accountId)!;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old timestamps
    account.requestTimestamps = account.requestTimestamps.filter(
      (ts) => ts > oneMinuteAgo
    );

    // Check if we've hit the rate limit
    return account.requestTimestamps.length >= account.config.rateLimit;
  }

  /**
   * Get a client for the specified or best account
   */
  getClient(accountId?: 'account1' | 'account2'): {
    client: GrokClient;
    accountId: 'account1' | 'account2';
  } {
    const selectedAccount = accountId || this.selectAccount();
    const account = this.accounts.get(selectedAccount)!;

    // Track request
    account.requestTimestamps.push(Date.now());
    account.stats.activeRequests++;
    account.stats.totalRequests++;
    account.stats.lastUsed = Date.now();

    return {
      client: account.client,
      accountId: selectedAccount,
    };
  }

  /**
   * Mark a request as complete and update stats
   */
  completeRequest(
    accountId: 'account1' | 'account2',
    tokensUsed: number,
    cost: number
  ): void {
    const account = this.accounts.get(accountId)!;
    account.stats.activeRequests = Math.max(0, account.stats.activeRequests - 1);
    account.stats.totalTokens += tokensUsed;
    account.stats.totalCost += cost;
  }

  /**
   * Get statistics for an account
   */
  getAccountStats(accountId: 'account1' | 'account2'): AccountStats {
    return { ...this.accounts.get(accountId)!.stats };
  }

  /**
   * Get statistics for all accounts
   */
  getAllStats(): {
    account1: AccountStats;
    account2: AccountStats;
    combined: {
      totalRequests: number;
      totalTokens: number;
      totalCost: number;
      activeRequests: number;
    };
  } {
    const account1Stats = this.getAccountStats('account1');
    const account2Stats = this.getAccountStats('account2');

    return {
      account1: account1Stats,
      account2: account2Stats,
      combined: {
        totalRequests: account1Stats.totalRequests + account2Stats.totalRequests,
        totalTokens: account1Stats.totalTokens + account2Stats.totalTokens,
        totalCost: account1Stats.totalCost + account2Stats.totalCost,
        activeRequests: account1Stats.activeRequests + account2Stats.activeRequests,
      },
    };
  }

  /**
   * Wait if both accounts are rate limited
   */
  async waitForAvailability(): Promise<void> {
    while (this.isRateLimited('account1') && this.isRateLimited('account2')) {
      // Wait 1 second and try again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Get account health status
   */
  getHealthStatus(): {
    account1: {
      available: boolean;
      activeRequests: number;
      rateLimitRemaining: number;
    };
    account2: {
      available: boolean;
      activeRequests: number;
      rateLimitRemaining: number;
    };
  } {
    const account1 = this.accounts.get('account1')!;
    const account2 = this.accounts.get('account2')!;

    const account1Limited = this.isRateLimited('account1');
    const account2Limited = this.isRateLimited('account2');

    return {
      account1: {
        available: !account1Limited && account1.stats.activeRequests < account1.config.maxConcurrent,
        activeRequests: account1.stats.activeRequests,
        rateLimitRemaining: account1.config.rateLimit - account1.requestTimestamps.length,
      },
      account2: {
        available: !account2Limited && account2.stats.activeRequests < account2.config.maxConcurrent,
        activeRequests: account2.stats.activeRequests,
        rateLimitRemaining: account2.config.rateLimit - account2.requestTimestamps.length,
      },
    };
  }

  /**
   * Change load balancing strategy
   */
  setStrategy(strategy: 'round-robin' | 'least-loaded' | 'cost-optimized'): void {
    this.strategy = strategy;
  }

  /**
   * Get current strategy
   */
  getStrategy(): string {
    return this.strategy;
  }
}
