import React from 'react';
import './Section.scss';

type SectionProps = {
  title: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

const Section: React.FC<SectionProps> = ({ title, leading, actions, children }) => {
  return (
    <section className="hp-section">
      {leading && <div className="hp-section__leading">{leading}</div>}
      <div className="hp-section__header">
        <div className="hp-section__titles">
          <p className="hp-section__eyebrow">{title}</p>
        </div>
        {actions && <div className="hp-section__actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
};

export default Section;
