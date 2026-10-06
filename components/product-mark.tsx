import { BookOpen, Check } from './app-icons';

export function AmanahMark({ small = false }: { small?: boolean }) {
  return <span className={'product-mark mark-amanah' + (small ? ' small' : '')} aria-hidden="true">
    <BookOpen className="mark-symbol"/><span className="mark-check"><Check weight="bold"/></span>
  </span>;
}
