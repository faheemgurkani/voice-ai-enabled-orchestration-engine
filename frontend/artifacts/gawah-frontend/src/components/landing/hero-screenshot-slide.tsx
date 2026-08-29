type HeroScreenshotSlideProps = {
  src?: string;
  label: string;
  alt: string;
  inDevelopment?: boolean;
};

/** A real app screenshot, framed like the rest of the hero's bento cards. */
export function HeroScreenshotSlide({ src, label, alt, inDevelopment }: HeroScreenshotSlideProps) {
  return (
    <div className="bento hero-screenshot">
      <div className="bento-h">
        <span className="dot dot-o" />
        {label}
        <span className="bento-name">{inDevelopment ? 'IN DEV' : 'LIVE UI'}</span>
      </div>
      <div className="hero-screenshot-frame">
        {inDevelopment ? (
          <div className="hero-screenshot-placeholder" role="status">
            UI in development
          </div>
        ) : (
          <img src={src} alt={alt} loading="lazy" />
        )}
      </div>
    </div>
  );
}
