import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import classNames from 'classnames';
import './Sidebar.scss';

export type SidebarItem = {
  id: string;
  label: string;
  icon: IconDefinition;
};

type SidebarProps = {
  brand: React.ReactNode;
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  footer?: React.ReactNode;
};

const Sidebar: React.FC<SidebarProps> = ({ brand, items, activeId, onSelect, footer }) => {
  return (
    <div className="hp-sidebar">
      <div className="hp-sidebar__brand">{brand}</div>
      <nav className="hp-sidebar__nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={classNames('hp-sidebar__item', { 'hp-sidebar__item--active': activeId === item.id })}
            onClick={() => onSelect(item.id)}
          >
            <FontAwesomeIcon icon={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {footer && <div className="hp-sidebar__footer">{footer}</div>}
    </div>
  );
};

export default Sidebar;
