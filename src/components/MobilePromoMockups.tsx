interface MobilePromoMockupsProps {
  className?: string;
  size?: "card" | "page";
}

export function MobilePromoMockups({
  className = "",
  size = "card",
}: MobilePromoMockupsProps) {
  return (
    <div
      className={`lf-platform-promo__devices ${size === "page" ? "lf-platform-promo__devices--page" : ""} ${className}`.trim()}
      aria-hidden
    >
      <img
        className="lf-platform-promo__device lf-platform-promo__device--phone"
        src="/promo/iphone-mockup.png"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <img
        className="lf-platform-promo__device lf-platform-promo__device--tablet"
        src="/promo/ipad-mockup.png"
        alt=""
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
