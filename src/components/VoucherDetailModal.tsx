import { CheckCircle, XCircle, Clock, Wallet, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { type PrivateCashVoucherTile } from "@/lib/voucher";
import { isMobilePlatform } from "@/lib/platform";

interface VoucherDetailModalProps {
  voucher: PrivateCashVoucherTile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VoucherDetailModal({
  voucher,
  open,
  onOpenChange,
}: VoucherDetailModalProps) {
  if (!voucher) return null;

  const descriptionId = "voucher-detail-description";
  const isMobile = isMobilePlatform();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!w-[48rem] max-w-[90vw] max-h-[85vh] overflow-hidden flex flex-col p-0"
        aria-describedby={descriptionId}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[var(--brand-light-green)]/10 flex-shrink-0">
          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--brand-light-dark-green)]">
                <Wallet className="size-5 text-[var(--brand-green)]" />
              </div>
              <DialogTitle className="text-2xl font-pp-machina text-[var(--text-primary)]">
                Voucher Details
              </DialogTitle>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className={`rounded-lg hover:bg-[var(--brand-light-dark-green)] transition-colors ${
                isMobile ? "h-11 w-11 grid place-items-center" : "p-2"
              }`}
              aria-label="Close voucher details"
            >
              <X className="size-5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" />
            </button>
          </div>
        </DialogHeader>

        <div
          className="space-y-6 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-white/30"
          id={descriptionId}
        >
          {/* Amount Highlight */}
          <Card variant="darkSolidGrey" className="py-6 px-4 gap-3">
            <CardHeader className="px-0 pb-2 text-center">
              <CardTitle className="text-[16px] font-normal text-[var(--text-tertiary)]">
                Voucher Amount
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-center">
              <div className="font-pp-machina text-[32px] leading-[32px] tracking-[-0.006em] text-[var(--brand-green-50)]">
                ${voucher.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.')[0]}.<span className="opacity-60 text-[22px]">{voucher.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.')[1]}</span>
              </div>
            </CardContent>
          </Card>

          {/* Voucher Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
              Information
            </h3>
            <div className="rounded-xl border border-[var(--brand-light-green)]/20 bg-[var(--brand-light-dark-green)]/50 divide-y divide-[var(--brand-light-green)]/10">
              <div className="flex justify-between items-center p-4">
                <span className="text-sm text-[var(--text-tertiary)]">ID</span>
                <span className="font-mono text-sm text-[var(--text-primary)]">
                  {voucher.id}
                </span>
              </div>
              <div className="flex justify-between items-center p-4">
                <span className="text-sm text-[var(--text-tertiary)]">Created</span>
                <span className="text-sm text-[var(--text-primary)]">
                  {new Date(voucher.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-start p-4 gap-4">
                <span className="text-sm text-[var(--text-tertiary)] flex-shrink-0">Recipient</span>
                <span className="font-mono text-xs text-[var(--text-primary)] text-right break-all">
                  {voucher.recipient}
                </span>
              </div>
            </div>
          </div>

          {/* Statistics */}
          {(voucher.readCount || voucher.writeCount) && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                Statistics
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {voucher.readCount !== undefined && (
                  <div className="rounded-xl border border-[var(--brand-light-green)]/20 bg-[var(--brand-light-dark-green)]/50 p-4 text-center">
                    <div className="text-3xl font-bold text-[var(--brand-green-50)] mb-1">
                      {voucher.readCount}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                      Total Reads
                    </div>
                    {voucher.lastReadAt && (
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-2">
                        Last: {new Date(voucher.lastReadAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
                {voucher.writeCount !== undefined && (
                  <div className="rounded-xl border border-[var(--brand-light-green)]/20 bg-[var(--brand-light-dark-green)]/50 p-4 text-center">
                    <div className="text-3xl font-bold text-[var(--brand-green-50)] mb-1">
                      {voucher.writeCount}
                    </div>
                    <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                      Total Writes
                    </div>
                    {voucher.lastWrittenAt && (
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-2">
                        Last: {new Date(voucher.lastWrittenAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* History Timeline */}
          {voucher.history && voucher.history.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                  Activity History
                </h3>
                <span className="text-xs px-2 py-1 rounded-md bg-[var(--brand-light-dark-green)] text-[var(--brand-green-50)]">
                  {voucher.history.length} {voucher.history.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-white/30">
                {[...voucher.history].reverse().map((event, idx) => (
                  <div
                    key={idx}
                    className="group rounded-xl border border-[var(--brand-light-green)]/15 bg-[var(--brand-light-dark-green)]/30 hover:bg-[var(--brand-light-dark-green)]/50 hover:border-[var(--brand-light-green)]/25 transition-all p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`p-1.5 rounded-lg ${event.success ? 'bg-[var(--brand-dark-green)]' : 'bg-red-900/20'}`}>
                          {event.success ? (
                            <CheckCircle className="size-4 text-[var(--brand-green)]" />
                          ) : (
                            <XCircle className="size-4 text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm capitalize text-[var(--text-primary)]">
                              {event.operation}
                            </span>
                            {event.success && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--brand-dark-green)] text-[var(--brand-green)] uppercase tracking-wider">
                                Success
                              </span>
                            )}
                          </div>
                          {event.tagUid && (
                            <div className="font-mono text-xs text-[var(--text-tertiary)] mb-1">
                              Tag: {event.tagUid}
                            </div>
                          )}
                          {event.error && (
                            <div className="text-xs text-red-400 mt-1 p-2 rounded bg-red-900/10 border border-red-500/20">
                              {event.error}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] flex-shrink-0">
                        <Clock className="size-3" />
                        <div className="text-right">
                          <div>{new Date(event.timestamp).toLocaleDateString()}</div>
                          <div className="text-[10px]">{new Date(event.timestamp).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--brand-light-green)]/10 bg-[var(--brand-light-dark-green)]/20 py-12">
              <div className="text-center text-[var(--text-tertiary)]">
                <Clock className="size-8 mx-auto mb-3 opacity-30" />
                <div className="text-sm">No activity history yet</div>
                <div className="text-xs mt-1 opacity-70">Read or write operations will appear here</div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

