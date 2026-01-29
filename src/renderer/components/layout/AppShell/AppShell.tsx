import React from 'react';
import './AppShell.scss';

type AppShellProps = {
  sidebar: React.ReactNode;
  titleBar?: React.ReactNode;
  children: React.ReactNode;
};

const AppShell: React.FC<AppShellProps> = ({ sidebar, titleBar, children }) => {
  return (
    <div className="hp-shell">
      {titleBar && <div className="hp-shell__titlebar">{titleBar}</div>}
      <div className="hp-shell__body">
        <aside className="hp-shell__sidebar">{sidebar}</aside>
        <main className="hp-shell__content">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
