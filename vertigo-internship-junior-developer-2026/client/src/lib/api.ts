const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketOutcome {
  id: number;
  title: string;
  odds: number;
  totalBets: number;
}

export interface Market {
  id: number;
  title: string;
  description?: string;
  status: "active" | "resolved" | "archived";
  creator?: string;
  createdAt?: string;
  resolvedOutcomeId?: number | null;
  outcomes: MarketOutcome[];
  totalMarketBets: number;
  totalParticipants?: number;
}

export interface MarketsResponse {
  markets: Market[];
  total: number;
  page: number;
  totalPages: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  balance: number;
  role: "user" | "admin";
  token: string;
  apiKey?: string | null;
}

export interface Bet {
  id: number;
  userId: number;
  marketId: number;
  outcomeId: number;
  amount: number;
  winnings?: number | null;
  newBalance: number;
  createdAt?: string;
}

export interface ActiveBet {
  id: number;
  marketId: number;
  marketTitle: string;
  outcomeTitle: string;
  amount: number;
  currentOdds: number;
  createdAt?: string;
}

export interface ResolvedBet {
  id: number;
  marketId: number;
  marketTitle: string;
  outcomeTitle: string;
  amount: number;
  winnings: number;
  won: boolean;
  createdAt?: string;
}

export interface PaginatedList<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  wonCount?: number; // only on resolvedBets
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  balance: number;
  role: "user" | "admin";
  apiKey?: string | null;
  activeBets: PaginatedList<ActiveBet>;
  resolvedBets: PaginatedList<ResolvedBet>;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  totalWinnings: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── API Client ───────────────────────────────────────────────────────────────

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeader() {
    const token = localStorage.getItem("auth_token");
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...this.getAuthHeader(),
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      if (data.errors && Array.isArray(data.errors)) {
        const msg = data.errors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(", ");
        throw new Error(msg);
      }
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return (data ?? {}) as T;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async register(username: string, email: string, password: string): Promise<User> {
    return this.request<User>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
  }

  async login(email: string, password: string): Promise<User> {
    return this.request<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  // ── Markets ───────────────────────────────────────────────────────────────

  async listMarkets(
    status: string = "active",
    page = 1,
    sort = "date",
  ): Promise<MarketsResponse> {
    return this.request<MarketsResponse>(
      `/api/markets?status=${status}&page=${page}&sort=${sort}`,
    );
  }

  async getMarket(id: number): Promise<Market> {
    return this.request<Market>(`/api/markets/${id}`);
  }

  async getSimilarMarkets(id: number): Promise<{ similar: { id: number; title: string; status: string; outcomesCount: number; totalMarketBets: number }[] }> {
    return this.request(`/api/markets/${id}/similar`);
  }

  async createMarket(title: string, description: string, outcomes: string[]): Promise<Market> {
    return this.request<Market>("/api/markets", {
      method: "POST",
      body: JSON.stringify({ title, description, outcomes }),
    });
  }

  async resolveMarket(marketId: number, outcomeId: number): Promise<{ message: string }> {
    return this.request(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcomeId }),
    });
  }

  async archiveMarket(marketId: number): Promise<{ message: string }> {
    return this.request(`/api/markets/${marketId}/archive`, {
      method: "POST",
    });
  }

  // ── Bets ──────────────────────────────────────────────────────────────────

  async placeBet(marketId: number, outcomeId: number, amount: number): Promise<Bet> {
    return this.request<Bet>(`/api/markets/${marketId}/bets`, {
      method: "POST",
      body: JSON.stringify({ outcomeId, amount }),
    });
  }

  // ── User ──────────────────────────────────────────────────────────────────

  async getUserProfile(activePage = 1, resolvedPage = 1): Promise<UserProfile> {
    return this.request<UserProfile>(
      `/api/users/me?activePage=${activePage}&resolvedPage=${resolvedPage}`,
    );
  }

  async generateApiKey(): Promise<{ apiKey: string }> {
    return this.request("/api/users/api-key", { method: "POST" });
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────

  async getLeaderboard(page = 1): Promise<LeaderboardResponse> {
    return this.request<LeaderboardResponse>(`/api/users/leaderboard?page=${page}`);
  }
}

export const api = new ApiClient(API_BASE_URL);
