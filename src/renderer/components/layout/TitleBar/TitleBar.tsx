import React from 'react';
import './TitleBar.scss';

type TitleBarProps = {
  title: string;
  iconSrc?: string;
};

const defaultTitleBarIcon = './logos/tray.png';

const TitleBar: React.FC<TitleBarProps> = ({ title, iconSrc = defaultTitleBarIcon }) => {
  return (
    <div className="hp-titlebar" role="banner">
      <div className="hp-titlebar__drag">
        <img src={iconSrc} alt="HyPortal logo" className="hp-titlebar__logo" width={24} height={24} />
        <div className="hp-titlebar__meta">
          <span className="hp-titlebar__title">{title}</span>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
