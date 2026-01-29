import React from 'react';
import classNames from 'classnames';
import './Badge.scss';

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
};

const Badge: React.FC<BadgeProps> = ({ children, className }) => {
  return <span className={classNames('hp-badge', className)}>{children}</span>;
};

export default Badge;
