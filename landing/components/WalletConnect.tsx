"use client";

import { useState } from "react";

// ── Fill in your actual addresses here ──────────────────────────────────────
const WALLETS = [
  {
    symbol: "ETH",
    name: "Ethereum",
    network: "ERC-20",
    address: "0xYourEthereumAddressHere",
    color: "#627EEA",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <polygon points="14,3 14,11 21,14" fill="#627EEA" opacity="0.6" />
        <polygon points="14,3 7,14 14,11" fill="#627EEA" />
        <polygon points="14,11 21,14 14,17" fill="#627EEA" opacity="0.6" />
        <polygon points="14,11 7,14 14,17" fill="#627EEA" />
        <polygon points="14,17 21,14 14,25" fill="#627EEA" opacity="0.6" />
        <polygon points="14,17 7,14 14,25" fill="#627EEA" />
      </svg>
    ),
  },
  {
    symbol: "SOL",
    name: "Solana",
    network: "Solana",
    address: "YourSolanaAddressHere",
    color: "#9945FF",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="6" width="18" height="3" rx="1.5" fill="#9945FF" />
        <rect x="6" y="12.5" width="18" height="3" rx="1.5" fill="#14F195" />
        <rect x="4" y="19" width="18" height="3" rx="1.5" fill="#9945FF" />
      </svg>
    ),
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    network: "Bitcoin",
    address: "YourBitcoinAddressHere",
    color: "#F7931A",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <text x="14" y="20" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#F7931A">₿</text>
      </svg>
    ),
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    network: "ERC-20 / SOL",
    address: "0xYourUSDCAddressHere",
    color: "#2775CA",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="11" stroke="#2775CA" strokeWidth="2" />
        <text x="14" y="19" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#2775CA">$</text>
      </svg>
    ),
  },
];

function truncate(addr: string) {
  if (addr.length <= 20) return addr;
  return addr.slice(0, 8) + "…" + addr.slice(-6);
}

function WalletCard({ wallet }: { wallet: (typeof WALLETS)[number] }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="group relative flex flex-col gap-3 rounded-2xl p-4 border transition-all duration-200 cursor-pointer"
      style={{
        background: "#111",
        borderColor: "#1e1e1e",
      }}
      onClick={copy}
    >
      {/* Hover glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ boxShadow: `0 0 0 1px ${wallet.color}33, 0 0 24px ${wallet.color}18` }}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: wallet.color + "18" }}
          >
            {wallet.icon}
          </div>
          <div>
            <p className="font-pixel text-[9px] text-white tracking-wide">{wallet.symbol}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#555" }}>{wallet.network}</p>
          </div>
        </div>
        <div
          className="font-pixel text-[7px] px-2 py-1 rounded-md transition-colors"
          style={{
            background: copied ? wallet.color + "22" : "#1e1e1e",
            color: copied ? wallet.color : "#444",
          }}
        >
          {copied ? "copied!" : "copy"}
        </div>
      </div>

      <div
        className="font-mono text-[10px] px-3 py-2 rounded-lg tracking-wide truncate"
        style={{ background: "#0a0a0a", color: "#555" }}
      >
        {truncate(wallet.address)}
      </div>
    </div>
  );
}

export default function WalletConnect() {
  return (
    <section className="py-24 overflow-hidden" style={{ background: "#0a0a0a" }}>
      <div className="mx-auto max-w-2xl px-5">
        <div className="text-center mb-12">
          <p className="font-pixel text-[9px] text-accent tracking-widest mb-4 uppercase">Support</p>
          <h2 className="font-pixel text-2xl sm:text-3xl text-white leading-tight">
            Pay with crypto
          </h2>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "#555" }}>
            Pick your chain. Click to copy the address.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WALLETS.map((w) => (
            <WalletCard key={w.symbol} wallet={w} />
          ))}
        </div>

        <p className="mt-6 text-center font-pixel text-[7px]" style={{ color: "#333" }}>
          double-check the address before sending
        </p>
      </div>
    </section>
  );
}
