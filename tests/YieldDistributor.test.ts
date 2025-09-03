// YieldDistributor.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface YieldData {
  totalEarnings: number;
  period: number;
  reportedBy: string;
  timestamp: number;
}

interface ClaimEntry {
  amount: number;
  claimed: boolean;
}

interface DistributionHistory {
  earnings: number;
  claimants: number;
}

interface DisputeResolution {
  resolved: boolean;
  adjustment: number;
}

interface ContractState {
  paused: boolean;
  admin: string;
  totalDistributed: number;
  distributionActive: boolean;
  yields: Map<number, YieldData>;
  claims: Map<string, ClaimEntry>; // Key as `${farmId}-${claimant}`
  trustedOracles: Map<string, boolean>;
  farmTokens: Map<number, string>;
  distributionHistory: Map<string, DistributionHistory>; // Key as `${farmId}-${period}`
  disputeResolutions: Map<string, DisputeResolution>; // Key as `${farmId}-${period}`
  pendingDistributions: Map<number, number>;
  blockHeight: number;
  // Mock token balances for simulation
  tokenBalances: Map<string, number>; // Key as `${principal}-${farmId}`
  tokenSupplies: Map<number, number>;
}

// Mock contract implementation
class YieldDistributorMock {
  private state: ContractState = {
    paused: false,
    admin: "deployer",
    totalDistributed: 0,
    distributionActive: false,
    yields: new Map(),
    claims: new Map(),
    trustedOracles: new Map(),
    farmTokens: new Map(),
    distributionHistory: new Map(),
    disputeResolutions: new Map(),
    pendingDistributions: new Map(),
    blockHeight: 100,
    tokenBalances: new Map(),
    tokenSupplies: new Map(),
  };

  private ERR_UNAUTHORIZED = 200;
  private ERR_PAUSED = 201;
  private ERR_NO_YIELD = 202;
  private ERR_ALREADY_CLAIMED = 203;
  private ERR_INVALID_FARM = 204;
  private ERR_INSUFFICIENT_FUNDS = 205;
  private ERR_ORACLE_NOT_TRUSTED = 206;
  private ERR_DISTRIBUTION_ACTIVE = 207;

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getTotalDistributed(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalDistributed };
  }

  getYield(farmId: number): ClarityResponse<YieldData | null> {
    return { ok: true, value: this.state.yields.get(farmId) ?? null };
  }

  getClaim(farmId: number, claimant: string): ClarityResponse<ClaimEntry | null> {
    const key = `${farmId}-${claimant}`;
    return { ok: true, value: this.state.claims.get(key) ?? null };
  }

  isTrustedOracle(oracle: string): boolean {
    return this.state.trustedOracles.get(oracle) ?? false;
  }

  getDistributionHistory(farmId: number, period: number): ClarityResponse<DistributionHistory | null> {
    const key = `${farmId}-${period}`;
    return { ok: true, value: this.state.distributionHistory.get(key) ?? null };
  }

  getDisputeResolution(farmId: number, period: number): ClarityResponse<DisputeResolution | null> {
    const key = `${farmId}-${period}`;
    return { ok: true, value: this.state.disputeResolutions.get(key) ?? null };
  }

  pause(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpause(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  addTrustedOracle(caller: string, oracle: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.trustedOracles.set(oracle, true);
    return { ok: true, value: true };
  }

  removeTrustedOracle(caller: string, oracle: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.trustedOracles.delete(oracle);
    return { ok: true, value: true };
  }

  reportYield(caller: string, farmId: number, totalEarnings: number, period: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isTrustedOracle(caller)) {
      return { ok: false, value: this.ERR_ORACLE_NOT_TRUSTED };
    }
    if (totalEarnings <= 0) {
      return { ok: false, value: this.ERR_NO_YIELD };
    }
    this.state.yields.set(farmId, { totalEarnings, period, reportedBy: caller, timestamp: this.state.blockHeight });
    this.state.pendingDistributions.set(farmId, totalEarnings);
    return { ok: true, value: true };
  }

  startDistribution(caller: string, farmId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (this.state.distributionActive) {
      return { ok: false, value: this.ERR_DISTRIBUTION_ACTIVE };
    }
    this.state.distributionActive = true;
    return { ok: true, value: true };
  }

  claimDividends(caller: string, farmId: number): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const yieldData = this.state.yields.get(farmId);
    if (!yieldData) {
      return { ok: false, value: this.ERR_INVALID_FARM };
    }
    const key = `${farmId}-${caller}`;
    const claimEntry = this.state.claims.get(key) ?? { amount: 0, claimed: false };
    if (claimEntry.claimed) {
      return { ok: false, value: this.ERR_ALREADY_CLAIMED };
    }
    const balanceKey = `${caller}-${farmId}`;
    const balance = this.state.tokenBalances.get(balanceKey) ?? 0;
    const totalSupply = this.state.tokenSupplies.get(farmId) ?? 1; // Avoid division by zero
    const share = Math.floor((yieldData.totalEarnings * balance) / totalSupply);
    if (share <= 0) {
      return { ok: false, value: this.ERR_NO_YIELD };
    }
    // Simulate transfer success
    this.state.claims.set(key, { amount: share, claimed: true });
    this.state.totalDistributed += share;
    const historyKey = `${farmId}-${yieldData.period}`;
    const history = this.state.distributionHistory.get(historyKey) ?? { earnings: yieldData.totalEarnings, claimants: 0 };
    this.state.distributionHistory.set(historyKey, { ...history, claimants: history.claimants + 1 });
    return { ok: true, value: share };
  }

  endDistribution(caller: string, farmId: number, period: number): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!this.state.distributionActive) {
      return { ok: false, value: this.ERR_NO_YIELD };
    }
    this.state.distributionActive = false;
    const key = `${farmId}-${period}`;
    this.state.distributionHistory.set(key, { earnings: this.state.pendingDistributions.get(farmId) ?? 0, claimants: 0 });
    this.state.pendingDistributions.delete(farmId);
    return { ok: true, value: true };
  }

  resolveDispute(caller: string, farmId: number, period: number, adjustment: number): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const key = `${farmId}-${period}`;
    this.state.disputeResolutions.set(key, { resolved: true, adjustment });
    return { ok: true, value: true };
  }

  batchClaim(caller: string, farmIds: number[]): ClarityResponse<number> {
    let totalClaimed = 0;
    for (const farmId of farmIds) {
      const result = this.claimDividends(caller, farmId);
      if (!result.ok) {
        return { ok: false, value: result.value as number };
      }
      totalClaimed += result.value as number;
    }
    return { ok: true, value: totalClaimed };
  }

  // Mock helpers
  setFarmToken(farmId: number, tokenContract: string) {
    this.state.farmTokens.set(farmId, tokenContract);
  }

  setTokenBalance(principal: string, farmId: number, balance: number) {
    const key = `${principal}-${farmId}`;
    this.state.tokenBalances.set(key, balance);
  }

  setTokenSupply(farmId: number, supply: number) {
    this.state.tokenSupplies.set(farmId, supply);
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  oracle: "oracle_1",
  user1: "wallet_2",
  user2: "wallet_3",
};

describe("YieldDistributor Contract", () => {
  let contract: YieldDistributorMock;

  beforeEach(() => {
    contract = new YieldDistributorMock();
  });

  it("should allow admin to add trusted oracle", () => {
    const addOracle = contract.addTrustedOracle(accounts.deployer, accounts.oracle);
    expect(addOracle).toEqual({ ok: true, value: true });
    expect(contract.isTrustedOracle(accounts.oracle)).toBe(true);
  });

  it("should prevent non-admin from adding oracle", () => {
    const addOracle = contract.addTrustedOracle(accounts.user1, accounts.oracle);
    expect(addOracle).toEqual({ ok: false, value: 200 });
  });

  it("should allow trusted oracle to report yield", () => {
    contract.addTrustedOracle(accounts.deployer, accounts.oracle);
    const reportResult = contract.reportYield(accounts.oracle, 1, 10000, 1);
    expect(reportResult).toEqual({ ok: true, value: true });
    const yieldData = contract.getYield(1);
    expect(yieldData).toEqual({
      ok: true,
      value: expect.objectContaining({ totalEarnings: 10000, period: 1 }),
    });
  });

  it("should prevent non-trusted oracle from reporting", () => {
    const reportResult = contract.reportYield(accounts.user1, 1, 10000, 1);
    expect(reportResult).toEqual({ ok: false, value: 206 });
  });

  it("should allow user to claim dividends", () => {
    contract.addTrustedOracle(accounts.deployer, accounts.oracle);
    contract.setFarmToken(1, "token-contract");
    contract.setTokenBalance(accounts.user1, 1, 100);
    contract.setTokenSupply(1, 1000);
    contract.reportYield(accounts.oracle, 1, 10000, 1);
    const claimResult = contract.claimDividends(accounts.user1, 1);
    expect(claimResult).toEqual({ ok: true, value: 1000 }); // 10000 * 100 / 1000 = 1000
    const claimEntry = contract.getClaim(1, accounts.user1);
    expect(claimEntry).toEqual({ ok: true, value: { amount: 1000, claimed: true } });
    expect(contract.getTotalDistributed()).toEqual({ ok: true, value: 1000 });
  });

  it("should prevent double claiming", () => {
    contract.addTrustedOracle(accounts.deployer, accounts.oracle);
    contract.setFarmToken(1, "token-contract");
    contract.setTokenBalance(accounts.user1, 1, 100);
    contract.setTokenSupply(1, 1000);
    contract.reportYield(accounts.oracle, 1, 10000, 1);
    contract.claimDividends(accounts.user1, 1);
    const secondClaim = contract.claimDividends(accounts.user1, 1);
    expect(secondClaim).toEqual({ ok: false, value: 203 });
  });

  it("should handle batch claims", () => {
    contract.addTrustedOracle(accounts.deployer, accounts.oracle);
    contract.setFarmToken(1, "token-contract");
    contract.setFarmToken(2, "token-contract");
    contract.setTokenBalance(accounts.user1, 1, 100);
    contract.setTokenSupply(1, 1000);
    contract.setTokenBalance(accounts.user1, 2, 200);
    contract.setTokenSupply(2, 2000);
    contract.reportYield(accounts.oracle, 1, 10000, 1);
    contract.reportYield(accounts.oracle, 2, 20000, 1);
    const batchResult = contract.batchClaim(accounts.user1, [1, 2]);
    expect(batchResult).toEqual({ ok: true, value: 3000 }); // 10000 * 100 / 1000 + 20000 * 200 / 2000 = 1000 + 2000 = 3000
    expect(contract.getClaim(1, accounts.user1)).toEqual({ ok: true, value: { amount: 1000, claimed: true } });
    expect(contract.getClaim(2, accounts.user1)).toEqual({ ok: true, value: { amount: 2000, claimed: true } });
    expect(contract.getTotalDistributed()).toEqual({ ok: true, value: 3000 });
  });

  it("should pause and prevent claims", () => {
    contract.pause(accounts.deployer);
    const claimDuringPause = contract.claimDividends(accounts.user1, 1);
    expect(claimDuringPause).toEqual({ ok: false, value: 201 }); // Fixed to expect ERR_PAUSED
  });

  it("should start and end distribution", () => {
    contract.addTrustedOracle(accounts.deployer, accounts.oracle);
    contract.setFarmToken(1, "token-contract");
    contract.reportYield(accounts.oracle, 1, 10000, 1);
    const startResult = contract.startDistribution(accounts.deployer, 1);
    expect(startResult).toEqual({ ok: true, value: true });
    const endResult = contract.endDistribution(accounts.deployer, 1, 1);
    expect(endResult).toEqual({ ok: true, value: true });
    const history = contract.getDistributionHistory(1, 1);
    expect(history).toEqual({ ok: true, value: { earnings: 10000, claimants: 0 } });
  });

  it("should resolve disputes", () => {
    const resolveResult = contract.resolveDispute(accounts.deployer, 1, 1, -500);
    expect(resolveResult).toEqual({ ok: true, value: true });
    const resolution = contract.getDisputeResolution(1, 1);
    expect(resolution).toEqual({ ok: true, value: { resolved: true, adjustment: -500 } });
  });
});