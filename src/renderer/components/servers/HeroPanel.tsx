import React from 'react';
import './HeroPanel.scss';

type HeroAction = {
  id: string;
  node: React.ReactNode;
};

type HeroPanelProps = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  actions?: HeroAction[];
  imageSrc?: string;
  imageAlt?: string;
};

const HeroPanel: React.FC<HeroPanelProps> = ({ eyebrow, title, subtitle, actions, imageSrc, imageAlt }) => {
  return (
    <header className="hp-hero">
      <div className="hp-hero__left">
        <div className="hp-hero__copy">
          {eyebrow ? <p className="hp-hero__eyebrow">{eyebrow}</p> : null}
          <h1 className="hp-hero__title">{title}</h1>
          <p className="hp-hero__subtitle">{subtitle}</p>
        </div>
        {actions && (
          <div className="hp-hero__actions">
            {actions.map((action) => (
              <React.Fragment key={action.id}>{action.node}</React.Fragment>
            ))}
          </div>
        )}
      </div>
      {imageSrc && (
        <div className="hp-hero__image-wrap">
          <img src={imageSrc} alt={imageAlt ?? ''} className="hp-hero__image" />
        </div>
      )}
    </header>
  );
};

export default HeroPanel;
