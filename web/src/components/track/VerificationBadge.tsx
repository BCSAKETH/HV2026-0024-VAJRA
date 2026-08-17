export function VerificationBadge({ badge }: { badge: "VERIFIED_GENUINE" | "CLONE_ATTACK_DETECTED" }) {
  if (badge === "CLONE_ATTACK_DETECTED") {
    return (
      <div className="flex items-center gap-2 rounded-full border border-brick bg-brick/10 px-4 py-2">
        <span className="h-2 w-2 rounded-full bg-brick" />
        <span className="font-semibold text-brick">Clone Attack Detected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-sage bg-sage/10 px-4 py-2" style={{ boxShadow: "0 0 16px 2px #6B8F7133" }}>
      <span className="h-2 w-2 rounded-full bg-sage" />
      <span className="font-semibold text-sage">Verified Genuine</span>
    </div>
  );
}
