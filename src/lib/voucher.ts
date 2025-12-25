export interface HistoryEvent {
  operation: 'read' | 'write';
  timestamp: string;
  tagUid?: string | null;
  success: boolean;
  error?: string;
}

export interface PrivateCashVoucher {
  voucherId: string;
  amount: number;
  secret: string;
  salt: string;
  recipient: string;
  txSignature: string;
  createdAt: string;
}

export type PrivateCashVoucherTile = PrivateCashVoucher & { 
  id: string;
  history?: HistoryEvent[];
  lastReadAt?: string;
  lastWrittenAt?: string;
  readCount?: number;
  writeCount?: number;
};

/**
 * Normalize and validate a voucher JSON payload into a voucher tile.
 * Throws when required fields are missing.
 */
export function buildVoucher(parsed: any, idSource?: string): PrivateCashVoucherTile {
  const idFromSource = idSource
    ? idSource.replace(/^.*[\\/]/, "").replace(/\.json$/i, "")
    : undefined;

  const voucher: PrivateCashVoucherTile = {
    id: parsed.id || idFromSource || String(Date.now()),
    voucherId: parsed.voucherId,
    amount: parsed.amount,
    recipient: parsed.recipient,
    secret: parsed.secret,
    salt: parsed.salt,
    txSignature: parsed.txSignature,
    createdAt: parsed.createdAt || new Date().toISOString(),
  };

  const required = [
    voucher.voucherId,
    voucher.amount,
    voucher.recipient,
    voucher.secret,
    voucher.salt,
    voucher.txSignature,
    voucher.createdAt,
  ];

  if (required.some((field) => field === undefined || field === null)) {
    throw new Error("Missing required voucher fields.");
  }

  return voucher;
}

export function createMockPrivateCashVouchers(now: number = Date.now()): PrivateCashVoucherTile[] {
  const base: PrivateCashVoucherTile[] = [
    {
      id: "1",
      voucherId: "0x74cccbb7db5be82b7c3d2d36e2cddb25649bd217f384ba003d10a751479b3591",
      amount: 3.25,
      txSignature:
        "14twWK9zNL2F8tUE7aSdtE53xLZ7i9mnYpiudGuwAYBRVQLezrpyhotAGmuf522zuRYjnPE4MV2f8NefBcqynjP",
      secret: "0xcb61b3870d94bef96de22653a3fa20b9e8b386b9446551ca60985ed57c948a7b",
      salt: "0x1daf0ee216260d49503ea68acb2b45949db4f7490d16c2eee4bd0113857ab1a1",
      recipient: "9Y6Aftit2gGPgY6H2DaDH1qnXE6qVhZ6kTpsuRWpuQXy",
      createdAt: new Date(now - 10 * 60_000).toISOString(), // 10 minutes ago
    },
    {
      id: "2",
      voucherId: "0x21d0d9f588921f41286baf2f0fb0c436f6bffafc66e3c0a7f0e17f609e7b0c10",
      amount: 1250.0,
      txSignature:
        "5xwT1k3gN9vZqPtFfX5L4uZf3mC9BrsLw8kT7hQw1rY2uI9pO3dE2sA1cV6bN8mK4tR2eW1qZ3xC5vB7nM",
      secret: "0xd1f74a6b9c2e5f0837a4c9e1b2d3f4a5c6b7d8e9f0a1b2c3d4e5f6a7b8c9d0e1",
      salt: "0x9f0e1d2c3b4a59687766554433221100ffeeddccbbaa99887766554433221100",
      recipient: "6uY4FzBzGbs8Xr3nFSevUNFZkJQbM2fzKk8nq9xWwd9H",
      createdAt: new Date(now - 2 * 60 * 60_000).toISOString(), // 2 hours ago
    },
    {
      id: "3",
      voucherId: "0xaabbccddeeff0011223344556677889900aabbccddeeff001122334455667788",
      amount: 42.5,
      txSignature:
        "3pLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuV",
      secret: "0xf0f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff",
      salt: "0xbbccddeeff0011223344556677889900aabbccddeeff00112233445566778899",
      recipient: "E7u4wF6kzL5P3Ge9mP4XofW8Hj1DzCJqY2q1t7RwY4hQ",
      createdAt: new Date(now - 3 * 24 * 60 * 60_000).toISOString(), // 3 days ago
    },
    {
      id: "4",
      voucherId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      amount: 9999.99,
      txSignature:
        "7yZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJ",
      secret: "0x11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff",
      salt: "0xccddeeff0011223344556677889900aabbccddeeff0011223344556677889900",
      recipient: "HtkX8YaNeC87xYVJcYcN3m5i5x6EPq5yRvCNr4CqpJ2U",
      createdAt: new Date(now - 2 * 7 * 24 * 60 * 60_000).toISOString(), // 2 weeks ago
    },
    {
      id: "5",
      voucherId: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      amount: 0.5,
      txSignature:
        "9qRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaB",
      secret: "0x2233445566778899aabbccddeeff00112233445566778899aabbccddeeff0011",
      salt: "0xddeeff0011223344556677889900aabbccddeeff0011223344556677889900aa",
      recipient: "3YhxU5qHn1E6nKXM3D1GVL2k5sJsbgweAVY9prs4DPWS",
      createdAt: new Date(now - 6 * 30 * 24 * 60 * 60_000).toISOString(), // ~6 months ago
    },
    {
      id: "6",
      voucherId: "0x0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f",
      amount: 250000,
      txSignature:
        "1aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkL",
      secret: "0x33445566778899aabbccddeeff00112233445566778899aabbccddeeff001122",
      salt: "0xeeff0011223344556677889900aabbccddeeff0011223344556677889900aabb",
      recipient: "2YyR9Jt6nMQC8VyZ6Pr8GkG7Anxf7vBYwygJyBEtQtd3",
      createdAt: new Date(now - 2 * 365 * 24 * 60 * 60_000).toISOString(), // ~2 years ago
    },
    {
      id: "7",
      voucherId: "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      amount: 75.0,
      txSignature:
        "2bCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlM",
      secret: "0x445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233",
      salt: "0xff0011223344556677889900aabbccddeeff0011223344556677889900aabbcc",
      recipient: "5zPKX1E9jF1dEYrKj6cGXg4y6xW8qVnQBzF1HwCu8SnT",
      createdAt: new Date(now - 45 * 60_000).toISOString(), // 45 minutes ago
    },
    {
      id: "8",
      voucherId: "0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
      amount: 1.0,
      txSignature:
        "4dEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnO",
      secret: "0x5566778899aabbccddeeff00112233445566778899aabbccddeeff0011223344",
      salt: "0x00113344556677889900aabbccddeeff00112233445566778899aabbccddeeff",
      recipient: "8kM9fYzD3w6XzF4Pg7kNp5Rt2cHs5vuY8f6SgB3Lk1uN",
      createdAt: new Date(now - 20 * 1_000).toISOString(), // <1 minute ago
    },
  ];

  return base
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getMockOfflineBalanceUsd(): number {
  return createMockPrivateCashVouchers().reduce((sum, voucher) => sum + voucher.amount, 0);
}

