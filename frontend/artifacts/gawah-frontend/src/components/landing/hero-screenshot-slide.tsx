type HeroScreenshotSlideProps = {
  src: string;
  label: string;
  alt: string;
};

/** A real app screenshot, framed like the rest of the hero's bento cards. */
export function HeroScreenshotSlide({ src, label, alt }: HeroScreenshotSlideProps) {
  return (
    <div className="bento hero-screenshot">
      <div className="bento-h">
        <span className="dot dot-o" />
        {label}
        <span className="bento-name">LIVE UI</span>
      </div>
      <div className="hero-screenshot-frame">
        <img src={src} alt={alt} loading="lazy" />
      </div>
    </div>
  );
}
