import React from 'react';
import classNames from 'classnames';
import './Tag.scss';

type TagTone = 'success' | 'neutral' | 'warning';

type TagProps = {
  tone?: TagTone;
  children: React.ReactNode;
};

const Tag: React.FC<TagProps> = ({ tone = 'neutral', children }) => {
  return <span className={classNames('hp-tag', `hp-tag--${tone}`)}>{children}</span>;
};

export default Tag;
