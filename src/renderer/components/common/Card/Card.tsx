import React from 'react';
import classNames from 'classnames';
import './Card.scss';

type CardProps = {
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
};

const Card: React.FC<CardProps> = ({ children, compact = false, className, onClick }) => {
  return <div className={classNames('hp-card', { 'hp-card--compact': compact }, className)} onClick={onClick}>{children}</div>;
};

export default Card;
