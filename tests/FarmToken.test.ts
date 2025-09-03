// FarmToken.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface LockedToken {
  amount: number;
  unlockBlock: number;
}

interface BatchEntry {
  recipient: string;
  amount: number;
  metadata: string;
}

interface ContractState {
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  totalSupply: number;
  paused: boolean;
  admin: string;
  balances: Map<string, number>;
  minters: Map<string, boolean>;
  allowances: Map<string, number>; // Key as `${owner}-${spender}`
  tokenMetadata: Map<number, string>;
  lockedTokens: Map<string, LockedToken>; // Key as `${owner}-${farmId}`
  farmAssociations: Map<number, string>;
  blockHeight: number; // Mock block height
}

// Mock contract implementation
class FarmTokenMock {
  private state: ContractState = {
    tokenName: "FarmShareToken",
    tokenSymbol: "FST",
    tokenDecimals: 6,
    totalSupply: 0,
    paused: false,
    admin: "deployer",
    balances: new Map(),
    minters: new Map(),
    allowances: new Map(),
    tokenMetadata: new Map(),
    lockedTokens: new Map(),
    farmAssociations: new Map(),
    blockHeight: 100,
  };

  private ERR_UNAUTHORIZED = 100;
  private ERR_PAUSED = 101;
  private ERR_INVALID_AMOUNT = 102;
  private ERR_INVALID_RECIPIENT = 103;
  private ERR_INVALID_MINTER = 104;
  private ERR_ALREADY_REGISTERED = 105;
  private ERR_METADATA_TOO_LONG = 106;
  private ERR_INSUFFICIENT_BALANCE = 107;
  private ERR_INVALID_FARM_ID = 108;
  private ERR_TOKEN_LOCKED = 109;
  private MAX_METADATA_LEN = 500;

  getName(): ClarityResponse<string> {
    return { ok: true, value: this.state.tokenName };
  }

  getSymbol(): ClarityResponse<string> {
    return { ok: true, value: this.state.tokenSymbol };
  }

  getDecimals(): ClarityResponse<number> {
    return { ok: true, value: this.state.tokenDecimals };
  }

  getTotalSupply(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getBalance(account: string): ClarityResponse<number> {
    return { ok: true, value: this.state.balances.get(account) ?? 0 };
  }

  getAllowance(owner: string, spender: string): ClarityResponse<number> {
    const key = `${owner}-${spender}`;
    return { ok: true, value: this.state.allowances.get(key) ?? 0 };
  }

  isMinter(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.minters.get(account) ?? false };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  getTokenMetadata(tokenId: number): ClarityResponse<string | null> {
    return { ok: true, value: this.state.tokenMetadata.get(tokenId) ?? null };
  }

  getLockedBalance(owner: string, farmId: number): ClarityResponse<number> {
    const key = `${owner}-${farmId}`;
    return { ok: true, value: this.state.lockedTokens.get(key)?.amount ?? 0 };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
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

  addMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (this.state.minters.has(minter)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    this.state.minters.set(minter, true);
    return { ok: true, value: true };
  }

  removeMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.minters.set(minter, false);
    return { ok: true, value: true };
  }

  mint(caller: string, amount: number, recipient: string, metadata: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.state.minters.get(caller)) {
      return { ok: false, value: this.ERR_INVALID_MINTER };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (recipient === "invalid") { // Mock invalid
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    if (metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_METADATA_TOO_LONG };
    }
    const currentBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalSupply += amount;
    return { ok: true, value: true };
  }

  transfer(caller: string, amount: number, sender: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== sender) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const senderBalance = this.state.balances.get(sender) ?? 0;
    if (senderBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(sender, senderBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    return { ok: true, value: true };
  }

  approve(caller: string, spender: string, amount: number): ClarityResponse<boolean> {
    const key = `${caller}-${spender}`;
    this.state.allowances.set(key, amount);
    return { ok: true, value: true };
  }

  transferFrom(caller: string, owner: string, recipient: string, amount: number): ClarityResponse<boolean> {
    const key = `${owner}-${caller}`;
    const allowance = this.state.allowances.get(key) ?? 0;
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (allowance < amount) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const ownerBalance = this.state.balances.get(owner) ?? 0;
    if (ownerBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.allowances.set(key, allowance - amount);
    this.state.balances.set(owner, ownerBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    return { ok: true, value: true };
  }

  burn(caller: string, amount: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const callerBalance = this.state.balances.get(caller) ?? 0;
    if (callerBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(caller, callerBalance - amount);
    this.state.totalSupply -= amount;
    return { ok: true, value: true };
  }

  lockTokens(caller: string, farmId: number, amount: number, unlockBlock: number): ClarityResponse<boolean> {
    const callerBalance = this.state.balances.get(caller) ?? 0;
    if (callerBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    if (unlockBlock <= this.state.blockHeight) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const key = `${caller}-${farmId}`;
    this.state.lockedTokens.set(key, { amount, unlockBlock });
    this.state.balances.set(caller, callerBalance - amount);
    return { ok: true, value: true };
  }

  unlockTokens(caller: string, farmId: number): ClarityResponse<boolean> {
    const key = `${caller}-${farmId}`;
    const locked = this.state.lockedTokens.get(key);
    if (!locked) {
      return { ok: false, value: this.ERR_INVALID_FARM_ID };
    }
    if (this.state.blockHeight < locked.unlockBlock) {
      return { ok: false, value: this.ERR_TOKEN_LOCKED };
    }
    const callerBalance = this.state.balances.get(caller) ?? 0;
    this.state.balances.set(caller, callerBalance + locked.amount);
    this.state.lockedTokens.delete(key);
    return { ok: true, value: true };
  }

  batchMint(caller: string, entries: BatchEntry[]): ClarityResponse<number> {
    let totalMinted = 0;
    for (const entry of entries) {
      const result = this.mint(caller, entry.amount, entry.recipient, entry.metadata);
      if (!result.ok) {
        return { ok: false, value: result.value as number };
      }
      totalMinted += entry.amount;
    }
    return { ok: true, value: totalMinted };
  }

  // Mock block height advance for testing
  advanceBlock(blocks: number) {
    this.state.blockHeight += blocks;
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  minter: "wallet_1",
  user1: "wallet_2",
  user2: "wallet_3",
};

describe("FarmToken Contract", () => {
  let contract: FarmTokenMock;

  beforeEach(() => {
    contract = new FarmTokenMock();
  });

  it("should initialize with correct token metadata", () => {
    expect(contract.getName()).toEqual({ ok: true, value: "FarmShareToken" });
    expect(contract.getSymbol()).toEqual({ ok: true, value: "FST" });
    expect(contract.getDecimals()).toEqual({ ok: true, value: 6 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 0 });
  });

  it("should allow admin to add minter", () => {
    const addMinter = contract.addMinter(accounts.deployer, accounts.minter);
    expect(addMinter).toEqual({ ok: true, value: true });
    const isMinter = contract.isMinter(accounts.minter);
    expect(isMinter).toEqual({ ok: true, value: true });
  });

  it("should prevent non-admin from adding minter", () => {
    const addMinter = contract.addMinter(accounts.user1, accounts.minter);
    expect(addMinter).toEqual({ ok: false, value: 100 });
  });

  it("should allow minter to mint tokens", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    const mintResult = contract.mint(accounts.minter, 1000, accounts.user1, "Farm metadata");
    expect(mintResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 1000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1000 });
  });

  it("should prevent non-minter from minting", () => {
    const mintResult = contract.mint(accounts.user1, 1000, accounts.user1, "Unauthorized");
    expect(mintResult).toEqual({ ok: false, value: 104 });
  });

  it("should allow token transfer", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000, accounts.user1, "Test");
    const transferResult = contract.transfer(accounts.user1, 500, accounts.user1, accounts.user2);
    expect(transferResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 500 });
  });

  it("should prevent transfer with insufficient balance", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 100, accounts.user1, "Test");
    const transferResult = contract.transfer(accounts.user1, 200, accounts.user1, accounts.user2);
    expect(transferResult).toEqual({ ok: false, value: 107 });
  });

  it("should allow approve and transfer-from", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000, accounts.user1, "Test");
    contract.approve(accounts.user1, accounts.user2, 500);
    const transferFrom = contract.transferFrom(accounts.user2, accounts.user1, accounts.user2, 300);
    expect(transferFrom).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 300 });
  });

  it("should allow burning tokens", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000, accounts.user1, "Test");
    const burnResult = contract.burn(accounts.user1, 300);
    expect(burnResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 700 });
  });

  it("should pause and unpause contract", () => {
    const pauseResult = contract.pause(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    const mintDuringPause = contract.mint(accounts.deployer, 1000, accounts.user1, "Paused");
    expect(mintDuringPause).toEqual({ ok: false, value: 101 });

    const unpauseResult = contract.unpause(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });

  it("should handle token locking and unlocking", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000, accounts.user1, "Test");
    const lockResult = contract.lockTokens(accounts.user1, 1, 500, 200);
    expect(lockResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500 });
    expect(contract.getLockedBalance(accounts.user1, 1)).toEqual({ ok: true, value: 500 });

    const earlyUnlock = contract.unlockTokens(accounts.user1, 1);
    expect(earlyUnlock).toEqual({ ok: false, value: 109 });

    contract.advanceBlock(101); // Advance to block 201
    const unlockResult = contract.unlockTokens(accounts.user1, 1);
    expect(unlockResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 1000 });
    expect(contract.getLockedBalance(accounts.user1, 1)).toEqual({ ok: true, value: 0 });
  });

  it("should handle batch minting", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    const entries: BatchEntry[] = [
      { recipient: accounts.user1, amount: 500, metadata: "Batch1" },
      { recipient: accounts.user2, amount: 300, metadata: "Batch2" },
    ];
    const batchResult = contract.batchMint(accounts.minter, entries);
    expect(batchResult).toEqual({ ok: true, value: 800 });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 300 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 800 });
  });

  it("should prevent metadata exceeding max length in mint", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    const longMetadata = "a".repeat(501);
    const mintResult = contract.mint(accounts.minter, 1000, accounts.user1, longMetadata);
    expect(mintResult).toEqual({ ok: false, value: 106 });
  });
});